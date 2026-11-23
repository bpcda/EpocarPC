// Publish via MCP to the external Supabase project. Brevo secrets are server-only.
import { createClient } from "npm:@supabase/supabase-js@2";

import { shootingEmail } from "./templates.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Cache-Control": "no-store" };
const reply = (status: number, state: string) => Response.json({ state }, { status, headers });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, "method");
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, "session");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return reply(401, "session");
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)) return reply(400, "request");
  const { data: booking, error } = await db.from("shooting_requests").select("id,email,day,actor,revision")
    .eq("id", body.id).maybeSingle();
  if (error) return reply(503, "database");
  if (booking?.actor !== user.id) {
    const role = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role.data) return reply(404, "request");
  }
  if (!booking) return reply(404, "request");
  const key = Deno.env.get("BREVO_API_KEY");
  const sender = Deno.env.get("SHOOTING_EMAIL_FROM");
  if (!key || !sender) return reply(503, "pending");
  const queue = () => db.from("shooting_messages");
  const claim = await queue().update({ delivery_state: "sending" }).eq("request_id", booking.id).eq("revision", booking.revision)
    .in("delivery_state", booking.actor === user.id ? ["pending"] : ["pending", "failed"]).select("id,kind,appointment,previous").maybeSingle();
  if (claim.error) return reply(503, "database");
  if (!claim.data) return reply(200, "already_processed");
  let state = "uncertain";
  try {
    const result = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": key, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        sender: { email: sender, name: "EPOCAR" }, to: [{ email: booking.email }],
        ...shootingEmail(claim.data.kind, booking.id, booking.day, claim.data.appointment, claim.data.previous),
      }),
    });
    if (result.ok) state = "sent";
    else if (result.status >= 400 && result.status < 500) state = "failed";
  } catch { /* A timeout may follow acceptance. Preserve the uncertain result for review. */ }
  const update = await queue().update({ delivery_state: state }).eq("id", claim.data.id).eq("delivery_state", "sending");
  return reply(!update.error && state === "sent" ? 200 : 503, update.error ? "uncertain" : state);
});
