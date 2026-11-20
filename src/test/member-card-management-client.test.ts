import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMemberCards } from "@/lib/member-card-management";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const row = { id: "10000000-0000-4000-8000-000000000001", full_name: "Socio sintetico", category: "Ordinario", card_number: 12, issued_at: "2026-11-20T10:00:00Z", status: "valid", svg: "<svg></svg>", url: "https://epocarpc.com/verifica-tessera#v2." + "a".repeat(64) };
beforeEach(() => vi.resetAllMocks());

describe("private card list client", () => {
  it("loads every page and sorts by card number without truncating the register", async () => {
    invoke.mockResolvedValueOnce({ data: { cards: [{ ...row, card_number: 20 }], next_cursor: row.id }, error: null })
      .mockResolvedValueOnce({ data: { cards: [{ ...row, id: "10000000-0000-4000-8000-000000000002", card_number: 2 }], next_cursor: null }, error: null });
    expect((await loadMemberCards()).map(card => card.card_number)).toEqual([2, 20]);
    expect(invoke.mock.calls).toEqual([["member-card-management", { body: { after: null } }], ["member-card-management", { body: { after: row.id } }]]);
  });
  it("does not return a partial list when a later page fails or repeats a cursor", async () => {
    invoke.mockResolvedValueOnce({ data: { cards: [row], next_cursor: row.id }, error: null }).mockResolvedValueOnce({ data: null, error: { private: "backend details" } });
    await expect(loadMemberCards()).rejects.toThrow("Tessere non disponibili o accesso non autorizzato.");
    invoke.mockResolvedValue({ data: { cards: [row], next_cursor: row.id }, error: null });
    await expect(loadMemberCards()).rejects.toThrow("Elenco incompleto");
  });
  it("rejects malformed/private responses and links outside the site's verification route", async () => {
    invoke.mockResolvedValueOnce({ data: { cards: [{ ...row, url: "https://foreign.invalid" }], next_cursor: null }, error: null });
    await expect(loadMemberCards()).rejects.toThrow("Tessere non disponibili");
  });
});
