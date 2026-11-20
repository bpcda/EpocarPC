import type { SupabaseClient } from "@supabase/supabase-js";
import { cardFeeSchema, cardMemberSchema, cardStatus } from "./status.ts";

const tokenPattern = /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{86})$/;
const origins = new Set(["https://epocarpc.com", "https://www.epocarpc.com"]);
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), c => c.charCodeAt(0));

export async function memberCard(req: Request, db: SupabaseClient, publicKey: string, now = new Date()) {
  const origin = req.headers.get("Origin");
  const headers = {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "https://epocarpc.com",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply(403, { status: "unavailable" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { status: "unavailable" });
  if (!/^[A-Za-z0-9_-]{43}$/.test(publicKey)) return reply(503, { status: "unavailable" });
  let token: string;
  try {
    let size = 0;
    const body = req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > 2048) throw new Error("body_limit");
        controller.enqueue(chunk);
      },
    }));
    const input = await new Response(body).json();
    if (!input || typeof input.token !== "string" || Object.keys(input).length !== 1) throw new Error("invalid_input");
    token = input.token;
  } catch { return reply(400, { status: "invalid" }); }
  const match = tokenPattern.exec(token);
  if (!match) return reply(400, { status: "invalid" });
  const key = await crypto.subtle.importKey("raw", decode(publicKey), "Ed25519", false, ["verify"]);
  const valid = await crypto.subtle.verify("Ed25519", key, decode(match[2]), new TextEncoder().encode(`epocar-card-v1:${match[1]}`));
  if (!valid) return reply(200, { status: "invalid", checked_at: now.toISOString() });
  try {
    const member = await db.from("member_public_status")
      .select("admission_status,admission_source,admission_date,admission_decision_date,membership_status,card_number,treasury_updated_at,last_revision")
      .eq("treasury_member_id", match[1]).maybeSingle();
    const parsed = cardMemberSchema.safeParse(member.data);
    if (member.error || !parsed.success) return reply(503, { status: "unavailable" });
    const fees = await db.from("member_annual_fees").select("membership_year,fee_status,last_payment_date")
      .eq("treasury_member_id", match[1]).order("membership_year", { ascending: false });
    const annual = cardFeeSchema.array().safeParse(fees.data);
    if (fees.error || !annual.success) return reply(503, { status: "unavailable" });
    const result = cardStatus(parsed.data, annual.data, now);
    return reply(result.status === "unavailable" ? 503 : 200, {
      ...result, card_number: parsed.data.card_number, checked_at: now.toISOString(), source_updated_at: parsed.data.treasury_updated_at,
    });
  } catch { return reply(503, { status: "unavailable" }); }
}
