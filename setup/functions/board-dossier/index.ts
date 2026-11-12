import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";
import { archiveDossier, createDossier } from "./archive.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Metodo non consentito" });
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) return json(401, { ok: false, message: "Sessione non valida" });
  let body;
  try {
    const text = await req.text();
    if (text.length > 4096) throw new Error();
    body = JSON.parse(text);
  } catch { return json(422, { ok: false, message: "Richiesta non valida" }); }
  if (!body || !["create", "archive"].includes(body.action) || !UUID.test(body.action === "create" ? body.meeting_id : body.dossier_id)) {
    return json(422, { ok: false, message: "Operazione o identificativo non valido" });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    if (body.action === "create") {
      const dossierId = await createDossier(db, user, body.meeting_id);
      return json(200, { ok: true, dossier_id: dossierId });
    }
    await archiveDossier(db, user, body.dossier_id, body.verified === true);
    return json(200, { ok: true });
  } catch (e) {
    return json(409, { ok: false, message: e instanceof Error ? e.message : "Archiviazione non riuscita" });
  }
});
