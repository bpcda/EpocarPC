// board-draft-minutes — bozza di verbale generata dall'IA (Fase 5, Fase B della specifica).
// Chiamata dal browser con il JWT del Presidente o del verbalizzante. La chiave del provider resta
// nel segreto BOARD_AI_API_KEY; il testo è salvato come nuova versione con origine 'ia' tramite
// la RPC board_minutes_save, quindi l'autore a registro resta l'utente che l'ha richiesta.
// Regole imposte al modello: nessuna delibera inventata, esiti di voto solo dal sistema di voto,
// interventi incerti marcati come tali. Il verbale resta sempre una bozza da revisionare.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TRANSCRIPT_CHARS = 100_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const requestId = crypto.randomUUID();
  const fail = (status: number, error: string, message: string) => json(status, { ok: false, error, message, request_id: requestId });

  const apiKey = Deno.env.get("BOARD_AI_API_KEY");
  if (!apiKey) return fail(503, "not_configured", "BOARD_AI_API_KEY non configurata nei segreti della funzione");

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return fail(401, "unauthorized", "Sessione non valida");
  const uid = userData.user.id;

  let meetingId = "";
  try {
    const body = await req.json();
    meetingId = typeof body?.meeting_id === "string" ? body.meeting_id : "";
  } catch { return fail(422, "invalid_request", "Corpo della richiesta non valido"); }
  if (!UUID.test(meetingId)) return fail(422, "invalid_request", "meeting_id non valido");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: meeting } = await db.from("board_meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!meeting) return fail(404, "not_found", "Riunione non trovata");
  if (!meeting.started_at) return fail(409, "invalid_state", "Il verbale si predispone per una seduta avviata");
  const { data: presRole } = await db.from("user_roles").select("role").eq("user_id", uid).eq("role", "president").maybeSingle();
  if (!presRole && meeting.minute_taker_id !== uid) {
    return fail(403, "forbidden", "Solo il Presidente o il verbalizzante possono generare la bozza");
  }

  const { data: settings } = await db.from("board_ai_settings").select("*").eq("id", true).maybeSingle();
  if (!settings?.enabled) return fail(409, "ai_disabled", "La redazione IA è disattivata nelle impostazioni");

  const [participants, agenda, deliberations, tracks] = await Promise.all([
    db.from("board_meeting_participants").select("display_name, kind, board_roles, present, attendance_mode").eq("meeting_id", meetingId),
    db.from("board_agenda_items").select("position, kind, title, description, proposal, discussion_status").eq("meeting_id", meetingId).order("position"),
    db.from("board_deliberations").select("number, title, status, board_ballots(result, tally, tie_break)").eq("meeting_id", meetingId),
    db.from("board_audio_tracks").select("kind, transcript").eq("meeting_id", meetingId).eq("status", "trascritta"),
  ]);

  const transcripts = (tracks.data ?? []).flatMap((t) =>
    (Array.isArray(t.transcript) ? t.transcript : []).map((s: { start?: number; speaker?: string | null; text?: string; attribution?: string }) =>
      `[${Math.floor(Number(s.start ?? 0) / 60)}:${String(Math.floor(Number(s.start ?? 0) % 60)).padStart(2, "0")}] ${s.speaker ?? "Intervento non attribuito con certezza"}: ${s.text ?? ""}`));
  let transcriptText = transcripts.join("\n");
  if (transcriptText.length > MAX_TRANSCRIPT_CHARS) transcriptText = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[...trascrizione troncata per limite di costo...]";

  const present = (participants.data ?? []).filter((p) => p.kind === "member" && p.present).map((p) => p.display_name);
  const absent = (participants.data ?? []).filter((p) => p.kind === "member" && !p.present).map((p) => p.display_name);
  const guests = (participants.data ?? []).filter((p) => p.kind === "guest").map((p) => p.display_name);

  const prompt = [
    "Sei il verbalizzante dell'associazione EPOCAR. Redigi la BOZZA del verbale della riunione del Consiglio Direttivo in italiano, stile formale e istituzionale, senza resoconti prolissi.",
    "Regole tassative: non inventare deliberazioni; gli esiti delle votazioni provengono solo dai dati di voto forniti; non attribuire interventi a persone non identificate con certezza (usa «Intervento non attribuito con certezza» o «Passaggio non chiaramente comprensibile»); conserva solo gli interventi rilevanti per le decisioni.",
    "Struttura obbligatoria: intestazione EPOCAR; numero e data della riunione; luogo e modalità; ora di apertura; Presidente; verbalizzante; presenti; assenti; verifica del quorum; ordine del giorno; resoconto della discussione per punto; deliberazioni assunte con esiti nominali delle votazioni; questioni rinviate; incarichi attribuiti; ora di chiusura; spazi per le sottoscrizioni del Presidente e del verbalizzante.",
    "",
    "DATI DELLA RIUNIONE (fonte certa):",
    JSON.stringify({
      numero: meeting.meeting_number, anno: meeting.meeting_year, data: meeting.scheduled_at,
      luogo: meeting.location, modalita: meeting.mode, apertura: meeting.started_at, chiusura: meeting.ended_at,
      presenti: present, assenti: absent, invitati: guests,
      ordine_del_giorno: agenda.data ?? [],
      deliberazioni_e_voti: deliberations.data ?? [],
    }, null, 1),
    "",
    "TRASCRIZIONI (fonte incerta, attribuzioni da verificare):",
    transcriptText || "(nessuna trascrizione disponibile: redigi solo dai dati certi, segnalando che il resoconto della discussione va integrato dal verbalizzante)",
  ].join("\n");

  try {
    const res = await fetch(`${settings.api_base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.drafting_model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) return fail(502, "drafting_failed", `provider IA: risposta ${res.status}`);
    const out = await res.json();
    const draft = String(out?.choices?.[0]?.message?.content ?? "").trim();
    if (draft.length < 200) return fail(502, "drafting_failed", "La bozza generata è vuota o troppo breve");

    // Salvataggio con il JWT dell'utente: permessi e autore restano quelli del richiedente.
    const { error: saveError } = await userClient.rpc("board_minutes_save", {
      _meeting: meetingId, _body: draft, _source: "ia",
    });
    if (saveError) return fail(409, "save_failed", saveError.message);
    return json(200, { ok: true, request_id: requestId, characters: draft.length });
  } catch (e) {
    return fail(502, "drafting_failed", e instanceof Error ? e.message : "errore sconosciuto");
  }
});
