import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { cardFeeSchema, cardMemberSchema, cardStatus } from "../member-card/status.ts";
import { MEMBER_CARDS_OWNER_ID } from "./owner.ts";

const inputSchema = z.object({ after: z.string().uuid().nullable().optional() }).strict();
const credentialSchema = z.object({
  treasury_member_id: z.string().uuid(), full_name: z.string().min(1).max(200), category: z.string(),
  card_number: z.number().int().positive(), issued_at: z.string().datetime({ offset: true }),
  qr_token: z.string().regex(/^(?:v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{86}|v2\.[0-9a-f]{64})$/),
  apple_wallet_path: z.string().nullable().optional(), google_wallet_url: z.string().nullable().optional(),
});
const origins = new Set(["https://epocarpc.com", "https://www.epocarpc.com"]);

export async function manageMemberCards(req: Request, db: SupabaseClient, makeSvg: (text: string) => Promise<string>, now = new Date()) {
  const origin = req.headers.get("Origin");
  const headers = {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "https://epocarpc.com",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply(403, { message: "Accesso riservato." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { message: "Metodo non consentito." });
  const jwt = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!jwt) return reply(401, { message: "Accedi per continuare." });
  try {
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data.user) return reply(401, { message: "Sessione non valida." });
    if (data.user.id !== MEMBER_CARDS_OWNER_ID) return reply(403, { message: "Accesso riservato al titolare." });
  } catch { return reply(401, { message: "Sessione non valida." }); }
  let after: string | null | undefined;
  try {
    let size = 0;
    const body = req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      size += chunk.byteLength; if (size > 1024) throw new Error("body_limit"); controller.enqueue(chunk);
    } }));
    after = inputSchema.parse(await new Response(body).json()).after;
  } catch { return reply(400, { message: "Richiesta non valida." }); }
  try {
    let query = db.from("member_card_credentials").select("treasury_member_id,full_name,category,card_number,qr_token,issued_at,apple_wallet_path,google_wallet_url").order("treasury_member_id").limit(51);
    if (after) query = query.gt("treasury_member_id", after);
    const result = await query;
    const parsed = credentialSchema.array().safeParse(result.data);
    if (result.error || !parsed.success) throw new Error("credentials_unavailable");
    const credentials = parsed.data.slice(0, 50);
    if (!credentials.length) return reply(200, { cards: [], next_cursor: null });
    const ids = credentials.map(card => card.treasury_member_id);
    const [members, fees] = await Promise.all([
      db.from("member_public_status").select("treasury_member_id,admission_status,admission_source,admission_date,admission_decision_date,membership_status,card_number,treasury_updated_at,last_revision").in("treasury_member_id", ids),
      db.from("member_annual_fees").select("treasury_member_id,membership_year,fee_status,last_payment_date").in("treasury_member_id", ids),
    ]);
    const cards = await Promise.all(credentials.map(async card => {
      const member = cardMemberSchema.safeParse(members.data?.find(m => m.treasury_member_id === card.treasury_member_id));
      const annual = cardFeeSchema.array().safeParse(fees.data?.filter(f => f.treasury_member_id === card.treasury_member_id));
      const status = !members.error && !fees.error && member.success && annual.success
        ? cardStatus(member.data, annual.data, now) : { status: "unavailable" as const };
      const url = `https://epocarpc.com/verifica-tessera#${card.qr_token}`;
      return { id: card.treasury_member_id, full_name: card.full_name, category: card.category, card_number: card.card_number,
        issued_at: card.issued_at, ...status, url, svg: await makeSvg(url), apple_wallet_available: Boolean(card.apple_wallet_path), google_wallet_url: card.google_wallet_url ?? null };
    }));
    return reply(200, { cards, next_cursor: parsed.data.length > 50 ? credentials[49].treasury_member_id : null });
  } catch { return reply(503, { message: "Tessere non disponibili. Riprova tra poco." }); }
}
