// @vitest-environment node
import { createPrivateKey, createPublicKey, createHash, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { cardMemberSchema, cardStatus } from "../../setup/functions/member-card/status";
import { memberCard } from "../../setup/functions/member-card/handler";

const id = "00000000-0000-4000-8000-000000000001";
const secret = "a".repeat(64);
const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(secret, "hex")]), format: "der", type: "pkcs8" });
const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
const signature = sign(null, Buffer.from(`epocar-card-v1:${id}`), privateKey).toString("base64url");
const token = `v1.${id}.${signature}`;
const member = {
  admission_status: "confirmed" as const, admission_source: "board_resolution" as const,
  admission_date: "2025-10-01", admission_decision_date: "2025-10-01", membership_status: "active" as const,
  card_number: 12, treasury_updated_at: "2026-01-01T08:00:00Z", last_revision: 4,
};
const fee = (year: number, status: "paid" | "partial" | "due" | "exempt", date: string | null = null) => ({ membership_year: year, fee_status: status, last_payment_date: date });
const check = (date: string, fees = [fee(2025, "paid", "2025-10-02")], data: Parameters<typeof cardStatus>[0] = member) => cardStatus(data, fees, new Date(date));

describe("membership card validity", () => {
  it("ends renewal grace precisely at midnight in Rome on 1 March", () => {
    const fees = [fee(2025, "paid", "2025-10-02"), fee(2026, "due")];
    expect(check("2026-02-28T22:59:59Z", fees)).toEqual({ status: "valid", renewal_due: true, valid_until: "2026-02-28" });
    expect(check("2026-02-28T23:00:00Z", fees)).toEqual({ status: "invalid" });
  });
  it("uses the last day of February in leap years", () => {
    const fees = [fee(2027, "paid", "2027-01-01"), fee(2028, "partial")];
    expect(check("2028-02-29T22:59:59Z", fees).status).toBe("valid");
    expect(check("2028-02-29T23:00:00Z", fees).status).toBe("invalid");
    expect(check("2027-07-01T00:00:00Z", [fee(2027, "exempt")])).toMatchObject({ valid_until: "2028-02-29" });
  });
  it("requires the correct year's fee and treats missing data as unavailable", () => {
    expect(check("2026-07-01T00:00:00Z", [fee(2027, "paid", "2026-01-01")]).status).toBe("unavailable");
    expect(check("2026-07-01T00:00:00Z", [fee(2026, "partial")]).status).toBe("invalid");
    expect(check("2026-07-01T00:00:00Z", [fee(2026, "exempt")]).status).toBe("valid");
    expect(check("2026-07-01T00:00:00Z", [fee(2026, "paid")]).status).toBe("unavailable");
    expect(check("2026-07-01T00:00:00Z", [fee(2026, "paid", "2026-12-01")]).status).toBe("unavailable");
  });
  it("does not restore a lapsed membership just because a late renewal was paid", () => {
    const fees = [fee(2026, "paid", "2026-03-10")];
    expect(check("2026-03-11T12:00:00Z", fees).status).toBe("invalid");
    expect(check("2026-03-11T12:00:00Z", fees, { ...member, admission_decision_date: "2026-03-10" }).status).toBe("valid");
    expect(check("2026-03-11T12:00:00Z", fees, { ...member, admission_decision_date: "2026-01-10" }).status).toBe("invalid");
  });
  it("allows an initial paid membership admitted after February", () => {
    expect(check("2026-11-20T10:00:00Z", [fee(2026, "paid", "2026-11-18")], { ...member, admission_date: "2026-10-07", admission_decision_date: "2026-10-07" })).toMatchObject({ status: "valid", valid_until: "2027-02-28" });
  });
  it("does not erase an earlier recorded lapse by paying a later year", () => {
    const fees = [fee(2025, "paid", "2025-10-02"), fee(2026, "due"), fee(2027, "paid", "2027-01-02")];
    expect(check("2027-03-01T12:00:00Z", fees).status).toBe("invalid");
    expect(check("2027-03-01T12:00:00Z", fees, { ...member, admission_decision_date: "2027-03-01" }).status).toBe("valid");
    expect(check("2027-03-01T12:00:00Z", [fee(2025, "paid", "2025-10-02"), fee(2026, "paid", "2026-03-10"), fee(2027, "exempt")]).status).toBe("invalid");
  });
  it("never derives admission or exemption from a role, category or card number", () => {
    expect(check("2026-07-01T00:00:00Z", [fee(2026, "exempt")], { ...member, admission_status: "unverified" }).status).toBe("unavailable");
    for (const membership_status of ["suspended", "ceased"] as const) {
      expect(check("2026-07-01T00:00:00Z", [fee(2026, "paid", "2026-01-01")], { ...member, membership_status }).status).toBe("invalid");
    }
    expect(cardMemberSchema.safeParse({ ...member, last_revision: 0 }).success).toBe(false);
  });
});

function harness({ data = member, databaseError = false, credentialExists = true } = {}) {
  const eq = vi.fn();
  const reads = vi.fn((table: string) => {
    const query = {
      select: () => query, eq: (key: string, value: unknown) => { eq(key, value); return query; },
      maybeSingle: async () => ({ data: table === "member_card_credentials" ? credentialExists ? { treasury_member_id: id } : null : data, error: databaseError ? { message: "secret-backend-detail" } : null }),
      order: async () => ({ data: [fee(2026, "paid", "2026-01-02")], error: null }),
    };
    return query;
  });
  const db = { from: reads } as unknown as Parameters<typeof memberCard>[1];
  const call = (body: unknown, method = "POST", origin = "https://epocarpc.com") => memberCard(new Request("https://edge.invalid/member-card", {
    method, headers: { Origin: origin }, ...(method === "OPTIONS" || method === "GET" ? {} : { body: JSON.stringify(body) }),
  }), db, publicKey, new Date("2026-11-20T10:00:00Z"));
  return { reads, eq, call };
}

describe("public card verification endpoint", () => {
  it("resolves automatic credentials by hash without putting raw QR tokens in data API URLs", async () => {
    const automatic = "v2." + "b".repeat(64);
    const h = harness();
    expect(await (await h.call({ token: automatic })).json()).toMatchObject({ status: "valid", card_number: 12 });
    expect(h.eq).toHaveBeenCalledWith("token_hash", createHash("sha256").update(automatic).digest("hex"));
    expect(h.eq).toHaveBeenCalledWith("treasury_member_id", id);
    expect(JSON.stringify(h.eq.mock.calls)).not.toContain(automatic);
    expect(await (await harness({ credentialExists: false }).call({ token: automatic })).json()).toMatchObject({ status: "invalid" });
  });
  it("accepts the exact same stable token generated by the Python exporter", async () => {
    const python = "import importlib.util; s=importlib.util.spec_from_file_location('cards','scripts/export-member-cards.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.token_for('" + id + "','" + secret + "'))";
    expect(execFileSync("python3", ["-B", "-c", python], { encoding: "utf8" }).trim()).toBe(token);
    const h = harness();
    const response = await h.call({ token });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ status: "valid", card_number: 12 });
    expect(Object.keys(result).sort()).toEqual(["card_number", "checked_at", "renewal_due", "source_updated_at", "status", "valid_until"]);
    expect(JSON.stringify(result)).not.toMatch(/treasury_member_id|fee_status|paid|email|full_name/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects modified signatures and malformed input before any database access", async () => {
    const h = harness();
    expect(await (await h.call({ token: token.slice(0, -3) + "aaa" })).json()).toMatchObject({ status: "invalid" });
    expect((await h.call({ token: "bad" })).status).toBe(400);
    expect((await h.call({ token, member_id: id })).status).toBe(400);
    expect((await h.call({ token: "x".repeat(10000) })).status).toBe(400);
    expect(h.reads).not.toHaveBeenCalled();
  });
  it("supports CORS and never treats a service failure as an invalid or valid membership", async () => {
    const h = harness({ databaseError: true });
    expect((await h.call({}, "OPTIONS")).status).toBe(204);
    expect((await h.call({}, "GET")).status).toBe(405);
    expect((await h.call({ token }, "POST", "https://foreign.invalid")).status).toBe(403);
    const response = await h.call({ token });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
