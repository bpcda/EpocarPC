import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MEMBER_CARDS_OWNER_ID } from "../member-card-management/owner.ts";
import { cardMemberSchema } from "../member-card/status.ts";
import { validateApplePass } from "./pass.ts";
import { googleWalletUrl, MAX_APPLE_PASS_BYTES, WALLET_BUCKET } from "./validation.ts";

const uuid = z.string().uuid();
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get"), member_id: uuid.optional() }).strict(),
  z.object({ action: z.literal("apple"), member_id: uuid.optional() }).strict(),
  z.object({ action: z.literal("set_google"), member_id: uuid, url: z.string().max(12000).nullable() }).strict(),
  z.object({ action: z.literal("remove_apple"), member_id: uuid }).strict(),
]);
const origins = new Set(["https://epocarpc.com", "https://www.epocarpc.com"]);
const ownedPath = (path: string, member: string) => path.startsWith(member + "/") && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pkpass$/.test(path);
function bounded(req: Request, max: number) {
  let size = 0;
  const stream = req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
    size += chunk.byteLength; if (size > max) throw new Error("Richiesta troppo grande."); controller.enqueue(chunk);
  } }));
  return new Response(stream, { headers: { "Content-Type": req.headers.get("Content-Type") ?? "application/json" } });
}

export async function memberWallet(req: Request, db: SupabaseClient) {
  const origin = req.headers.get("Origin");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "https://epocarpc.com",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (status: number, data: object) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.has(origin)) return reply(403, { message: "Accesso non consentito." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { message: "Metodo non consentito." });
  const jwt = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!jwt) return reply(401, { message: "Accedi per continuare." });
  let userId: string;
  try {
    const auth = await db.auth.getUser(jwt);
    if (auth.error || !auth.data.user) return reply(401, { message: "Sessione non valida." });
    userId = auth.data.user.id;
  } catch { return reply(401, { message: "Sessione non valida." }); }
  const owner = userId === MEMBER_CARDS_OWNER_ID;
  const upload = req.headers.get("Content-Type")?.toLowerCase().startsWith("multipart/form-data");
  if (upload && !owner) return reply(403, { message: "Solo il titolare può caricare le tessere." });
  let file: File | null = null;
  let input: z.infer<typeof inputSchema> | { action: "upload_apple"; member_id: string };
  try {
    if (upload) {
      const form = await bounded(req, MAX_APPLE_PASS_BYTES + 65536).formData();
      const item = form.get("file");
      if (!(item instanceof File) || !item.name.toLowerCase().endsWith(".pkpass") || item.size > MAX_APPLE_PASS_BYTES || Array.from(form.keys()).length !== 2) throw new Error("Carica un file .pkpass, massimo 5 MB.");
      file = item;
      input = { action: "upload_apple", member_id: uuid.parse(form.get("member_id")) };
    } else input = inputSchema.parse(await bounded(req, 16000).json());
  } catch { return reply(400, { message: "Richiesta non valida: controlla file, dimensione e dati della tessera." }); }
  if (!owner && (input.member_id || !["get", "apple"].includes(input.action))) return reply(403, { message: "Puoi consultare soltanto la tua tessera." });
  try {
    let memberId = input.member_id;
    if (!memberId) {
      const member = await db.from("member_public_status").select("treasury_member_id,admission_status,admission_source,admission_date,admission_decision_date,membership_status,card_number,treasury_updated_at,last_revision").eq("user_id", userId).maybeSingle();
      if (member.error) throw new Error("service");
      const parsed = cardMemberSchema.safeParse(member.data);
      const admission = parsed.success ? parsed.data.admission_decision_date ?? parsed.data.admission_date : null;
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
      if (!parsed.success || parsed.data.admission_status !== "confirmed" || !parsed.data.admission_source || parsed.data.membership_status !== "active"
        || !admission || admission > today || Date.parse(parsed.data.treasury_updated_at) > Date.now() + 300000 || !uuid.safeParse(member.data.treasury_member_id).success) {
        return input.action === "get" ? reply(200, { apple_available: false, google_url: null }) : reply(403, { message: "La tessera non è disponibile per questo account." });
      }
      memberId = member.data.treasury_member_id;
    }
    const stored = await db.from("member_card_credentials").select("qr_token,apple_wallet_path,google_wallet_url").eq("treasury_member_id", memberId).maybeSingle();
    if (stored.error) throw new Error("service");
    if (!stored.data) return input.action === "get" ? reply(200, { apple_available: false, google_url: null }) : reply(404, { message: "La tessera non è ancora disponibile." });
    const card = stored.data;
    const storage = db.storage.from(WALLET_BUCKET);
    if (input.action === "get") {
      let google: string | null = null;
      try { if (card.google_wallet_url) google = googleWalletUrl(card.google_wallet_url); } catch { /* Expired Google links must not block the Apple pass. */ }
      return reply(200, { apple_available: Boolean(card.apple_wallet_path && ownedPath(card.apple_wallet_path, memberId)), google_url: google });
    }
    if (input.action === "apple") {
      if (!card.apple_wallet_path || !ownedPath(card.apple_wallet_path, memberId)) return reply(404, { message: "Il file Apple Wallet non è ancora disponibile." });
      const signed = await storage.createSignedUrl(card.apple_wallet_path, 120);
      if (signed.error || !signed.data?.signedUrl) throw new Error("service");
      return reply(200, { url: signed.data.signedUrl });
    }
    if (!owner) return reply(403, { message: "Operazione riservata al titolare." });
    const expectedQr = `https://epocarpc.com/verifica-tessera#${card.qr_token}`;
    if (input.action === "set_google") {
      let url: string | null = null;
      try { if (input.url?.trim()) url = googleWalletUrl(input.url, expectedQr); }
      catch (error) { return reply(400, { message: error instanceof Error ? error.message : "Link Google Wallet non valido." }); }
      const saved = await db.from("member_card_credentials").update({ google_wallet_url: url, wallet_updated_at: new Date().toISOString() }).eq("treasury_member_id", memberId);
      if (saved.error) throw new Error("service");
      return reply(200, { ok: true });
    }
    let path: string | null = null;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      try { await validateApplePass(bytes, expectedQr); }
      catch { return reply(400, { message: "File Apple Wallet non valido: controlla integrità, firma e corrispondenza del QR con il socio selezionato." }); }
      path = `${memberId}/${crypto.randomUUID()}.pkpass`;
      const uploaded = await storage.upload(path, bytes, { contentType: "application/vnd.apple.pkpass", cacheControl: "0", upsert: false });
      if (uploaded.error) throw new Error("service");
    }
    const saved = await db.from("member_card_credentials").update({ apple_wallet_path: path, wallet_updated_at: new Date().toISOString() }).eq("treasury_member_id", memberId);
    if (saved.error) { if (path) await storage.remove([path]); throw new Error("service"); }
    if (card.apple_wallet_path && ownedPath(card.apple_wallet_path, memberId)) {
      try { await storage.remove([card.apple_wallet_path]); } catch { /* A cleanup failure must not undo a saved replacement. */ }
    }
    return reply(200, { ok: true });
  } catch { return reply(503, { message: "Tessera Wallet non disponibile. Riprova tra poco." }); }
}
