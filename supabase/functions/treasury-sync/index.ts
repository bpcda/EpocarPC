// treasury-sync — server-to-server endpoint polled by the private Treasury (outbound only: Treasury -> HTTPS -> here).
// Auth: Authorization: Bearer <TREASURY_SYNC_SECRET> + X-Treasury-Timestamp (±300 s). Writes need Idempotency-Key.
// The service_role key never leaves this function. Contract: docs/treasury-sync-contract.md
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_SKEW_MS = 300_000;
const RATE_LIMIT_PER_MIN = 120;
const WRITE_ACTIONS = new Set(["review", "approve", "reject", "cancel", "member_update", "bootstrap_ack"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown, requestId: string) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Request-Id": requestId, "Cache-Control": "no-store" } });

async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function sqlError(message: string): [number, string] {
  if (message.startsWith("not_found")) return [404, "not_found"];
  if (message.startsWith("idempotency_conflict")) return [409, "idempotency_conflict"];
  if (message.startsWith("conflict")) return [409, "conflict"];
  if (message.startsWith("invalid_state")) return [409, "invalid_state"];
  if (message.startsWith("invalid")) return [422, "invalid_request"];
  return [500, "internal_error"];
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("X-Request-Id")?.slice(0, 100) || crypto.randomUUID();
  const secret = Deno.env.get("TREASURY_SYNC_SECRET");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const log = (http_status: number, authorized: boolean) =>
    db.from("treasury_sync_access_log").insert({ action: action.slice(0, 40), http_status, request_id: requestId, authorized }).then(() => undefined, () => undefined);
  const fail = async (status: number, error: string, message: string, authorized: boolean) => {
    await log(status, authorized);
    return json(status, { ok: false, error, message, request_id: requestId }, requestId);
  };

  if (!secret || secret.length < 32) return fail(503, "not_configured", "TREASURY_SYNC_SECRET is not configured", false);

  // 1) Authentication (no CORS: this endpoint is never called by browsers).
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !(await safeEqual(token, secret))) return fail(401, "unauthorized", "Invalid or missing credentials", false);
  const ts = Date.parse(req.headers.get("X-Treasury-Timestamp") ?? "");
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return fail(401, "stale_timestamp", "X-Treasury-Timestamp missing or outside ±300 s", false);

  // 2) Rate limiting (authorized calls in the last minute).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("treasury_sync_access_log").select("id", { count: "exact", head: true }).gte("at", since).eq("authorized", true);
  if ((count ?? 0) >= RATE_LIMIT_PER_MIN) return fail(429, "rate_limited", "Too many requests, retry later", true);

  try {
    // 3) Pending applications (read-only, cursor pagination).
    if (action === "pending") {
      if (req.method !== "GET") return fail(405, "method_not_allowed", "Use GET for action=pending", true);
      const statuses = (url.searchParams.get("status") ?? "submitted").split(",").filter((s) => s === "submitted" || s === "review");
      if (!statuses.length) return fail(422, "invalid_request", "status must be submitted and/or review", true);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
      let afterSubmitted: string | null = null, afterId: string | null = null;
      const cursor = url.searchParams.get("cursor");
      if (cursor) {
        try {
          const c = JSON.parse(atob(cursor));
          if (typeof c.s !== "string" || !UUID.test(c.id)) throw new Error();
          afterSubmitted = c.s; afterId = c.id;
        } catch { return fail(422, "invalid_request", "Invalid cursor", true); }
      }
      const { data, error } = await db.rpc("treasury_sync_pending", { _statuses: statuses, _limit: limit, _after_submitted: afterSubmitted, _after_id: afterId });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<Record<string, string | null>>;
      const applications = await Promise.all(rows.map(async (r) => {
        let file_url: string | null = null;
        if (r.file_path) file_url = (await db.storage.from("membership-submissions").createSignedUrl(r.file_path, 600)).data?.signedUrl ?? null;
        return {
          application_id: r.application_id, user_id: r.user_id, status: r.status, full_name: r.full_name, email: r.email,
          requested_category: r.requested_category, submitted_at: r.submitted_at, updated_at: r.updated_at,
          form: r.file_path ? { filename: r.filename, file_url, file_url_expires_in: 600 } : null,
        };
      }));
      const last = rows[rows.length - 1];
      const next_cursor = rows.length === limit && last ? btoa(JSON.stringify({ s: last.submitted_at, id: last.application_id })) : null;
      await log(200, true);
      return json(200, { ok: true, request_id: requestId, applications, next_cursor }, requestId);
    }

    // 3b) Category-role reconciliation candidates, not an admitted-member register. Read-only.
    if (action === "bootstrap_members") {
      if (req.method !== "GET") return fail(405, "method_not_allowed", "Use GET for action=bootstrap_members", true);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
      const cursor = url.searchParams.get("cursor");
      if (cursor && !UUID.test(cursor)) return fail(422, "invalid_request", "Invalid cursor", true);
      const { data, error } = await db.rpc("treasury_sync_bootstrap_members", { _limit: limit, _after: cursor || null });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const members = rows.map((r) => ({
        external_member_id: r.external_member_id, user_id: r.user_id, first_name: r.first_name ?? null, last_name: r.last_name ?? null,
        full_name: r.full_name ?? null, email: r.email ?? null, category: r.category, board_roles: r.board_roles ?? [],
        category_source: "site_role", admission: { status: "unknown", source: null },
        admission_date: r.admission_date ?? null, card_number: r.card_number ?? null,
        treasury_member_id: r.treasury_member_id ?? null, acknowledged_at: r.acknowledged_at ?? null,
        account_created_at: r.account_created_at ?? null,
      }));
      const next_cursor = rows.length === limit ? (rows[rows.length - 1].external_member_id as string) : null;
      await log(200, true);
      return json(200, { ok: true, request_id: requestId, members, next_cursor }, requestId);
    }

    // 4) Decisions / member updates.
    if (!WRITE_ACTIONS.has(action)) return fail(400, "unknown_action", "Unknown action", true);
    if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST for write actions", true);
    const key = req.headers.get("Idempotency-Key") ?? "";
    if (key.length < 8 || key.length > 200) return fail(400, "missing_idempotency_key", "Idempotency-Key header (8-200 chars) is required", true);
    let payload: Record<string, unknown>;
    try { payload = await req.json(); } catch { return fail(400, "invalid_json", "Body must be JSON", true); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail(400, "invalid_json", "Body must be a JSON object", true);
    for (const f of ["application_id", "treasury_member_id"] as const) {
      if (payload[f] != null && (typeof payload[f] !== "string" || !UUID.test(payload[f] as string))) return fail(422, "invalid_request", `${f} must be a UUID`, true);
    }
    if (payload.external_member_id != null && (typeof payload.external_member_id !== "string" || !UUID.test(payload.external_member_id))) return fail(422, "invalid_request", "external_member_id must be a UUID", true);
    // member_update v2 envelope: event_id + revision + updated_at travel together (legacy member{...} stays valid).
    if (action === "member_update" && (payload.event_id != null || payload.revision != null || payload.updated_at != null)) {
      const eid = payload.event_id, rev = payload.revision, ts = payload.updated_at;
      if (typeof eid !== "string" || eid.length < 8 || eid.length > 100) return fail(422, "invalid_request", "event_id must be a string of 8-100 chars", true);
      if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return fail(422, "invalid_request", "revision must be a positive integer", true);
      if (typeof ts !== "string" || Number.isNaN(Date.parse(ts))) return fail(422, "invalid_request", "updated_at must be an ISO 8601 timestamp", true);
    }
    let rpc = "treasury_sync_apply";
    let args: Record<string, unknown> = { _action: action, _idempotency_key: key, _request_id: requestId, _payload: payload };
    if (action === "bootstrap_ack") { rpc = "treasury_sync_bootstrap_ack"; args = { _idempotency_key: key, _request_id: requestId, _payload: payload }; }
    else if (action === "member_update") {
      // Bootstrap-linked members are routed by treasury_member_id or by external_member_id (historic members).
      let linked = 0;
      if (typeof payload.treasury_member_id === "string") {
        const { count } = await db.from("treasury_bootstrap_links").select("treasury_member_id", { count: "exact", head: true }).eq("treasury_member_id", payload.treasury_member_id);
        linked = count ?? 0;
      }
      if (!linked && typeof payload.external_member_id === "string") {
        const { count } = await db.from("treasury_bootstrap_links").select("external_member_id", { count: "exact", head: true }).eq("external_member_id", payload.external_member_id);
        linked = count ?? 0;
      }
      if (linked > 0) { rpc = "treasury_sync_bootstrap_member_update"; args = { _idempotency_key: key, _request_id: requestId, _payload: payload }; }
    }
    const { data, error } = await db.rpc(rpc, args);
    if (error) {
      const [status, code] = sqlError(error.message);
      return fail(status, code, status === 500 ? "Unexpected error" : error.message, true);
    }
    await log(200, true);
    return json(200, { ...(data as object), request_id: requestId }, requestId);
  } catch (e) {
    console.error("treasury-sync", requestId, e instanceof Error ? e.message : e);
    return fail(500, "internal_error", "Unexpected error", true);
  }
});
