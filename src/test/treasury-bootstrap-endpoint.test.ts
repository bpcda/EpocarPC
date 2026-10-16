import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const secret = "synthetic-only-secret-not-a-real-credential";
const id = "00000000-0000-4000-8000-000000000001";
function endpoint(rows: Record<string, unknown>[] = []) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  const insert = vi.fn(async () => ({ error: null }));
  const db = { rpc, from: () => ({ insert, select: () => ({ gte: () => ({ eq: async () => ({ count: 0 }) }) }) }) };
  const Deno = { env: { get: () => secret }, serve: (fn: typeof handler) => { handler = fn; } };
  const source = readFileSync("supabase/functions/treasury-sync/index.ts", "utf8").replace(/^import .*;\s*$/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "createClient", compiled)(Deno, () => db);
  return { rpc, async call(query = "", authorized = true) {
    if (!handler) throw new Error("Endpoint not registered");
    return handler(new Request(`http://localhost/treasury-sync?action=bootstrap_members${query}`, { headers: {
      Authorization: `Bearer ${authorized ? secret : "wrong"}`, "X-Treasury-Timestamp": new Date().toISOString(),
    } }));
  } };
}

describe("compatible bootstrap HTTPS response with synthetic data", () => {
  it("adds explicit site category source and unknown admission while preserving all existing fields", async () => {
    const row = { external_member_id: id, user_id: id, first_name: "Synthetic", last_name: "Person", full_name: "Synthetic Person",
      email: "synthetic@example.invalid", category: "Fondatore", board_roles: ["president"], admission_date: null,
      card_number: null, treasury_member_id: null, acknowledged_at: null, account_created_at: "2026-10-16T00:00:00Z" };
    const fn = endpoint([row]);
    const response = await fn.call();
    expect(response.status).toBe(200);
    expect((await response.json()).members).toEqual([{ ...row, category_source: "site_role", admission: { status: "unknown", source: null } }]);
    expect(fn.rpc).toHaveBeenCalledExactlyOnceWith("treasury_sync_bootstrap_members", { _limit: 50, _after: null });
  });
  it("never infers admission from an acknowledgement, card, date or supplied projection", async () => {
    const fn = endpoint([{ external_member_id: id, user_id: id, category: "Fondatore", card_number: 12,
      admission_date: "2020-01-01", treasury_member_id: id, acknowledged_at: "2026-10-16T00:00:00Z",
      membership_status: "active", admission: { status: "confirmed", source: "site_role" } }]);
    const body = await (await fn.call()).json();
    expect(body.members[0].admission).toEqual({ status: "unknown", source: null });
    expect(body.members[0].card_number).toBe(12);
    expect(body.members[0].admission_date).toBe("2020-01-01");
  });
  it("preserves cursor and page size without adding write operations", async () => {
    const fn = endpoint([{ external_member_id: id }]);
    const body = await (await fn.call(`&limit=1&cursor=${id}`)).json();
    expect(body.next_cursor).toBe(id);
    expect(fn.rpc).toHaveBeenCalledExactlyOnceWith("treasury_sync_bootstrap_members", { _limit: 1, _after: id });
  });
  it("denies unauthenticated callers before reading candidates", async () => {
    const fn = endpoint();
    expect((await fn.call("", false)).status).toBe(401);
    expect(fn.rpc).not.toHaveBeenCalled();
  });
});