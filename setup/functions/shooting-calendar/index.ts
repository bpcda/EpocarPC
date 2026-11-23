import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";
import { syncEvent, type CalendarJob } from "./google.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Cache-Control": "no-store" };
const reply = (state: string, status = 200) => Response.json({ state }, { status, headers: cors });
const tokenUrl = "https://oauth2.googleapis.com/token";

async function googleToken(secret: string) {
  const { client_email, private_key } = JSON.parse(secret);
  const key = await importPKCS8(private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/calendar.events" })
    .setProtectedHeader({ alg: "RS256" }).setIssuer(client_email).setAudience(tokenUrl)
    .setIssuedAt().setExpirationTime("5m").sign(key);
  const response = await fetch(tokenUrl, { method: "POST", signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error("google_auth");
  const { access_token } = await response.json();
  if (!access_token) throw new Error("google_auth");
  return access_token;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply("method", 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply("session", 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  // The RPC verifies auth.uid() and the admin role inside the database.
  const status = () => caller.rpc("shooting_calendar_status");
  const before = await status();
  if (before.error) return reply("unavailable", before.error.message === "admin_required" ? 403 : 503);
  const calendar = Deno.env.get("SHOOTING_GOOGLE_CALENDAR_ID")?.trim();
  const secret = Deno.env.get("SHOOTING_GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!calendar || calendar === "primary" || !secret) return reply("setup");

  try {
    const token = await googleToken(secret);
    const base = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendar) + "/events";
    const google = (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", "Bearer " + token);
      return fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(8000) });
    };
    const access = await google("?maxResults=1&fields=accessRole");
    if (!access.ok || !["writer","owner"].includes((await access.json()).accessRole)) return reply("access");
    if (before.data === 0) return reply("synced");

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: jobs, error } = await service.rpc("shooting_calendar_claim", { p_calendar: calendar });
    if (error) return reply("retry", 503);
    if (!jobs?.length) return reply("busy");
    const results = await Promise.all((jobs as CalendarJob[]).map(async job => {
      const update: Record<string, unknown> = { lease: null, lease_until: null, last_error: null };
      try {
        if (job.calendar_id !== calendar) throw new Error("calendar_changed");
        if (await syncEvent(job, google) === "recreate") update.remote_id = crypto.randomUUID();
        else update.applied_revision = job.revision;
      } catch { update.last_error = "retry"; }
      const saved = await service.from("shooting_calendar_events").update(update).eq("id", job.id).eq("lease", job.lease)
        .select("id").maybeSingle();
      return !saved.error && !!saved.data && !update.last_error;
    }));
    if (results.includes(false)) return reply("retry");
    const after = await status();
    if (after.error) return reply("retry");
    return reply(after.data ? "more" : "synced");
  } catch { return reply("access"); }
});
