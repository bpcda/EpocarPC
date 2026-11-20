// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { manageMemberCards } from "../../setup/functions/member-card-management/handler";
import { MEMBER_CARDS_OWNER_ID } from "../../setup/functions/member-card-management/owner";

const id = "10000000-0000-4000-8000-000000000001";
const issued = { treasury_member_id: id, full_name: "Socio sintetico", category: "Ordinario", card_number: 12, issued_at: "2026-11-20T10:00:00Z", qr_token: "v2." + "a".repeat(64) };
const member = { treasury_member_id: id, admission_status: "confirmed", admission_source: "board_resolution", admission_date: "2026-10-01", admission_decision_date: "2026-10-01", membership_status: "active", card_number: 12, treasury_updated_at: "2026-11-20T10:00:00Z", last_revision: 3 };

function harness({ userId = MEMBER_CARDS_OWNER_ID as string | null, failed = "", rows = [issued] } = {}) {
  const auth = vi.fn(async () => ({ data: { user: userId ? { id: userId, user_metadata: { id: MEMBER_CARDS_OWNER_ID, role: "admin" } } : null }, error: null }));
  const reads = vi.fn((table: string) => {
    const data = table === "member_card_credentials" ? rows : table === "member_public_status" ? [member] : [{ treasury_member_id: id, membership_year: 2026, fee_status: "paid", last_payment_date: "2026-10-02" }];
    const result = { data: failed === table ? null : data, error: failed === table ? { message: "private backend failure" } : null };
    const query = { select: () => query, order: () => query, limit: () => query, gt: () => query, in: () => query, then: (fn: (value: typeof result) => unknown) => Promise.resolve(result).then(fn) };
    return query;
  });
  const db = { auth: { getUser: auth }, from: reads } as unknown as Parameters<typeof manageMemberCards>[1];
  const makeSvg = vi.fn(async (text: string) => `<svg>${text}</svg>`);
  const call = (body: unknown = {}, jwt = "signed-session", method = "POST") => manageMemberCards(new Request("https://edge.invalid", {
    method, headers: { Origin: "https://epocarpc.com", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, ...(method === "OPTIONS" ? {} : { body: JSON.stringify(body) }),
  }), db, makeSvg, new Date("2026-11-20T11:00:00Z"));
  return { call, reads, auth, makeSvg };
}

describe("only the single owner can access member cards", () => {
  it("rejects guests and invalid sessions before reading any card", async () => {
    const h = harness(); expect((await h.call({}, "")).status).toBe(401); expect(h.reads).not.toHaveBeenCalled();
    const invalid = harness({ userId: null }); expect((await invalid.call()).status).toBe(401); expect(invalid.reads).not.toHaveBeenCalled();
  });
  it("rejects a different user even with owner/admin claims in editable metadata", async () => {
    const h = harness({ userId: "20000000-0000-4000-8000-000000000002" });
    expect((await h.call()).status).toBe(403); expect(h.reads).not.toHaveBeenCalled(); expect(h.makeSvg).not.toHaveBeenCalled();
  });
  it("lets the owner repeatedly retrieve the same issued QR without creating or changing anything", async () => {
    const h = harness(); const first = await h.call(); const data = await first.json();
    expect(first.status).toBe(200); expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(data.cards[0]).toMatchObject({ id, full_name: issued.full_name, card_number: 12, status: "valid", url: "https://epocarpc.com/verifica-tessera#" + issued.qr_token });
    expect(await (await h.call()).json()).toEqual(data); expect(data.next_cursor).toBeNull();
    expect(h.auth).toHaveBeenCalledWith("signed-session");
  });
  it("keeps an issued QR downloadable when current status cannot be retrieved", async () => {
    const h = harness({ failed: "member_public_status" });
    const data = await (await h.call()).json(); expect(data.cards[0]).toMatchObject({ status: "unavailable", url: "https://epocarpc.com/verifica-tessera#" + issued.qr_token });
    expect(JSON.stringify(data)).not.toContain("private backend failure");
  });
  it("rejects forged selectors and oversized input and handles empty lists", async () => {
    const h = harness(); expect((await h.call({ owner_id: MEMBER_CARDS_OWNER_ID })).status).toBe(400);
    expect((await h.call({ after: "bad" })).status).toBe(400); expect((await h.call({ after: "x".repeat(5000) })).status).toBe(400);
    expect(h.reads).not.toHaveBeenCalled();
    expect(await (await harness({ rows: [] }).call()).json()).toEqual({ cards: [], next_cursor: null });
    expect((await h.call({}, "", "OPTIONS")).status).toBe(204);
  });
  it("paginates issued credentials and fails safely if the private registry is unavailable", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ ...issued, treasury_member_id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    const data = await (await harness({ rows }).call()).json(); expect(data.cards).toHaveLength(50); expect(data.next_cursor).toBe(rows[49].treasury_member_id);
    const response = await harness({ failed: "member_card_credentials" }).call(); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private backend failure");
  });
});
