import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
import { deleteMyAccount, adminDeleteAccount, accountStatus, describeStatus } from "@/lib/account-deletion";

const fn = readFileSync("supabase/functions/delete-account/index.ts", "utf8");
const sql = readFileSync("setup/account-deletion-v8.sql", "utf8");

describe("client calls", () => {
  beforeEach(() => invoke.mockReset().mockResolvedValue({ data: { outcome: "deleted" }, error: null }));
  it("self-delete never sends a user id", async () => {
    await deleteMyAccount();
    expect(invoke).toHaveBeenCalledWith("delete-account", { body: {} });
  });
  it("admin delete sends only the target", async () => {
    await adminDeleteAccount("11111111-1111-4111-8111-111111111111");
    expect(invoke.mock.calls[0][1].body).toEqual({ target_user_id: "11111111-1111-4111-8111-111111111111" });
  });
  it("maps last-admin refusal to the required message", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "last_admin" }), { status: 409 }) } });
    await expect(deleteMyAccount()).rejects.toThrow("Non puoi eliminare l'ultimo amministratore del sistema.");
  });
  it("self status check sends no id", async () => {
    await accountStatus();
    expect(invoke.mock.calls[0][1].body).toEqual({ dry_run: true });
  });
  it("classifies account kinds", () => {
    const b = { exists: true, is_admin: false, last_admin: false };
    expect(describeStatus({ ...b, application_status: "approved", is_member: true })).toBe("member");
    expect(describeStatus({ ...b, application_status: "review", is_member: false })).toBe("pending");
    expect(describeStatus({ ...b, application_status: "draft", is_member: false })).toBe("draft");
    expect(describeStatus({ ...b, application_status: null, is_member: false })).toBe("user");
  });
});

describe("edge function guarantees", () => {
  it("derives the self target from the verified JWT", () => {
    expect(fn).toMatch(/getClaims/);
    expect(fn).toMatch(/target_user_id as string \| undefined\) \?\? actor/);
  });
  it("checks the admin role server-side before deleting someone else", () => {
    expect(fn).toMatch(/mode === "admin"[\s\S]*has_role[\s\S]*forbidden/);
  });
  it("removes avatars and treats a missing user as already deleted", () => {
    expect(fn).toMatch(/"avatars"/);
    expect(fn).toMatch(/already_deleted/);
    expect(fn).toMatch(/status !== 404/);
  });
  it("never calls the Treasury", () => {
    expect(fn).not.toMatch(/treasury-sync|TREASURY_SYNC_SECRET/);
  });
});

describe("database script", () => {
  it("keeps functions service-only", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.account_deletion_prepare\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/_mode = 'self' AND _actor <> _target/);
  });
  it("withdraws pending applications, deletes drafts, keeps decided ones", () => {
    expect(sql).toMatch(/status = ''draft'' RETURNING file_path/);
    expect(sql).toMatch(/SET status = ''cancelled''/);
    expect(sql).toMatch(/'kept'/);
  });
  it("never deletes or anonymises Treasury data", () => {
    expect(sql).not.toMatch(/DELETE FROM public\.(association_members|treasury_|association_member_events)/);
    expect(sql).toMatch(/UPDATE public\.association_members SET user_id = NULL WHERE user_id = \$1/);
  });
  it("protects the last admin, serialises retries and audits", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'last_admin'/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/account_deletion_log_immutable/);
  });
  it("does not relink a deleted email automatically", () => {
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.account_deletion_log/);
  });
});

describe("frontend bundle", () => {
  it("never references the service role key", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    for (const f of walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("/test/")))
      expect(readFileSync(f, "utf8")).not.toMatch(/SERVICE_ROLE/);
  });
});
