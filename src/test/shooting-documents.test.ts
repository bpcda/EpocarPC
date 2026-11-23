// @vitest-environment node
import { expect, it, vi } from "vitest";
import { calendarDraft } from "@/lib/shooting-calendar";
import { policyWithFile, splitPolicy } from "@/components/shooting/PolicyPdf";

const upload = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload }) } } }));

it("snapshots a new PDF and retains the attachment on a text-only edit", async () => {
  const pdf = new File(["%PDF-1.7 test"], "document.pdf", { type: "application/pdf" });
  const snapshot = await policyWithFile("2026-12-03", "images", "Usi approvati", "", pdf);
  expect(splitPolicy(snapshot)).toEqual({ text: "Usi approvati", path: expect.stringMatching(/^shooting\/2026-12-03\/images\//) });
  const revised = await policyWithFile("2026-12-03", "images", "Nuovi usi", snapshot);
  expect(splitPolicy(revised).path).toBe(splitPolicy(snapshot).path);
  expect(upload).toHaveBeenCalledTimes(1);
  await expect(policyWithFile("2026-12-03", "privacy", "", "", new File(["wrong"],"fake.pdf"))).rejects.toThrow("PDF valido");
});

it("prepares the chosen slot in Italian local time for Google Calendar", () => {
  const params = new URL(calendarDraft({ id:"a",day:"2026-12-17",starts:"18:50:00",capacity:2,duration_minutes:20 }, "Piazza & Museo")).searchParams;
  expect(params.get("dates")).toBe("20261217T185000/20261217T191000");
  expect(params.get("ctz")).toBe("Europe/Rome");
  expect(params.get("location")).toBe("Piazza & Museo");
});
