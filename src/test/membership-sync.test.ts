import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { applicantPayload, cardLabel, memberStatusSchema, submissionSchema } from "@/lib/association";

const sql = readFileSync("setup/membership-sync-v6.sql", "utf8");
const fn = readFileSync("supabase/functions/treasury-sync/index.ts", "utf8");

describe("browser payloads", () => {
  it("never forwards Treasury-governed fields", () => {
    const out = applicantPayload({ full_name: "A B", status: "submitted", treasury_member_id: "x", approved_at: "now", card_number: 1 });
    expect(out).toEqual({ full_name: "A B", status: "submitted" });
  });
  it("refuses decision statuses", () => {
    for (const s of ["approved", "rejected", "review", "cancelled"]) expect(() => applicantPayload({ status: s })).toThrow();
  });
  it("parses the new states", () => {
    const base = { id: crypto.randomUUID(), user_id: crypto.randomUUID(), full_name: "A", email: "a@b.it", file_path: null, filename: null, created_at: "2026-01-01" };
    expect(submissionSchema.parse({ ...base, status: "cancelled" }).status).toBe("cancelled");
  });
});

describe("card number", () => {
  it("is shown only when assigned, never invented", () => {
    expect(cardLabel(null)).toBe("Tessera non ancora assegnata");
    expect(cardLabel(12)).toBe("n. 12");
    expect(memberStatusSchema.safeParse({ membership_status: "active", category: "Ordinario", card_number: 0, admission_date: null, membership_year: null, fee_status: null, updated_at: "x" }).success).toBe(false);
  });
});

describe("server-side guarantees (schema script)", () => {
  it("removes the browser approval and protects governed columns", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.membership_decide/);
    expect(sql).toMatch(/membership_applications_guard/);
    expect(sql).toMatch(/REVOKE UPDATE ON public\.membership_applications FROM authenticated/);
    expect(sql).not.toMatch(/GRANT UPDATE \([^)]*treasury_member_id/);
  });
  it("keeps sync functions service-only and idempotent", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.treasury_sync_apply\(text, text, text, jsonb\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/membership_applications_treasury_member_uq/);
    expect(sql).toMatch(/idempotency_key text PRIMARY KEY/);
    expect(sql).toMatch(/CREATE POLICY mps_read_own ON public\.member_public_status FOR SELECT TO authenticated USING \(user_id = auth\.uid\(\)\)/);
  });
});

describe("treasury-sync endpoint", () => {
  it("requires the shared secret, a fresh timestamp and an idempotency key", () => {
    expect(fn).toMatch(/TREASURY_SYNC_SECRET/);
    expect(fn).toMatch(/safeEqual/);
    expect(fn).toMatch(/X-Treasury-Timestamp/);
    expect(fn).toMatch(/Idempotency-Key/);
    expect(fn).not.toMatch(/Access-Control-Allow-Origin/);
  });
});
