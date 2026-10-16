// delete-account — deletes a PORTAL account (never the Treasury member).
// Self: the target is always the caller from the verified JWT (no user_id accepted).
// Admin: { target_user_id } allowed only if the caller has the admin role, checked server-side.
// { dry_run: true } returns the account status for the confirmation dialog.
// The service_role key never leaves this function. SQL: setup/account-deletion-v8.sql
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_BUCKETS = ["avatars", "vehicles", "registration-uploads"];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// deno-lint-ignore no-explicit-any
async function removeFolder(db: any, bucket: string, folder: string) {
  for (let i = 0; i < 20; i++) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100 });
    if (error || !data?.length) return;
    const paths = data.filter((f: { id: string | null }) => f.id).map((f: { name: string }) => `${folder}/${f.name}`);
    if (!paths.length) return;
    await db.storage.from(bucket).remove(paths);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json(503, { error: "not_configured" });
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: claimsErr } = await asUser.auth.getClaims(auth.slice(7));
  const actor = claims?.claims?.sub;
  if (claimsErr || !actor || !UUID.test(actor)) return json(401, { error: "unauthorized" });

  let body: { target_user_id?: unknown; dry_run?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body = self */ }
  if (body.target_user_id !== undefined && (typeof body.target_user_id !== "string" || !UUID.test(body.target_user_id)))
    return json(400, { error: "invalid_request" });
  if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") return json(400, { error: "invalid_request" });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const target = (body.target_user_id as string | undefined) ?? actor;
  const mode = target === actor ? "self" : "admin";
  if (mode === "admin") {
    const { data: isAdmin, error } = await db.rpc("has_role", { _user_id: actor, _role: "admin" });
    if (error || isAdmin !== true) return json(403, { error: "forbidden" });
  }

  let stage = "status";
  try {
    // Always fail closed before any writes. The SQL status RPC also checks that
    // prepare/finalize are installed with the expected signatures and grants.
    const { data: status, error: statusError } = await db.rpc("account_deletion_status", { _target: target });
    if (statusError) {
      console.error("delete-account", mode, stage, statusError.code, statusError.message);
      if (statusError.code === "PGRST202" || statusError.code === "42883" || statusError.message.includes("account_deletion_schema_not_ready"))
        return json(503, { error: "schema_not_ready" });
      throw new Error(statusError.message);
    }
    if (!status || typeof status.exists !== "boolean" || typeof status.last_admin !== "boolean" || typeof status.is_member !== "boolean")
      throw new Error("invalid_status_response");
    if (body.dry_run) return json(200, status);

    stage = "prepare";
    const { data: prep, error: prepErr } = await db.rpc("account_deletion_prepare", { _actor: actor, _target: target, _mode: mode });
    if (prepErr) {
      if (prepErr.message.includes("last_admin")) return json(409, { error: "last_admin", message: "Non puoi eliminare l'ultimo amministratore del sistema." });
      throw new Error(prepErr.message);
    }
    if (prep?.outcome === "already_deleted") {
      stage = "finalize";
      const { error } = await db.rpc("account_deletion_finalize", { _actor: actor, _target: target, _mode: mode, _outcome: "already_deleted" });
      if (error) throw new Error(error.message);
      return json(200, { outcome: "already_deleted" });
    }
    if (prep?.outcome !== "prepared") throw new Error("invalid_prepare_response");

    stage = "storage";
    for (const b of USER_BUCKETS) await removeFolder(db, b, target);
    if (prep?.draft_file) await db.storage.from("membership-submissions").remove([prep.draft_file]);

    // Removes the app's own auth identity (incl. Google link) and invalidates its sessions. Google itself is untouched.
    stage = "auth_delete";
    const { error: delErr } = await db.auth.admin.deleteUser(target);
    if (delErr && delErr.status !== 404) throw new Error(delErr.message);
    stage = "finalize";
    const { error: finErr } = await db.rpc("account_deletion_finalize", { _actor: actor, _target: target, _mode: mode, _outcome: "deleted" });
    if (finErr) throw new Error(finErr.message);

    return json(200, { outcome: "deleted", application_outcome: prep?.application_outcome ?? "none", is_member: !!prep?.is_member });
  } catch (e) {
    console.error("delete-account", mode, stage, e instanceof Error ? e.message : "error");
    return json(500, { error: "internal_error" });
  }
});
