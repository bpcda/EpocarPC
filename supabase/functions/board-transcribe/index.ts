// board-transcribe — trascrizione IA delle tracce audio della seduta (Fase 4).
// Chiamata dal browser con il JWT dell'utente: solo Presidente o verbalizzante della riunione.
// La chiave del provider IA resta nel segreto BOARD_AI_API_KEY; configurazione in public.board_ai_settings.
// Le trascrizioni sono scritte solo tramite la RPC service-only board_audio_track_update_service.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

type Segment = { start: number; end: number; speaker: string | null; text: string; attribution: "verificata" | "incerta" | "non_attribuita" };

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

  let trackId = "";
  try {
    const body = await req.json();
    trackId = typeof body?.track_id === "string" ? body.track_id : "";
  } catch { return fail(422, "invalid_request", "Corpo della richiesta non valido"); }
  if (!UUID.test(trackId)) return fail(422, "invalid_request", "track_id non valido");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: track } = await db.from("board_audio_tracks").select("*").eq("id", trackId).maybeSingle();
  if (!track) return fail(404, "not_found", "Traccia non trovata");
  if (!["caricata", "errore"].includes(track.status)) return fail(409, "invalid_state", "La traccia non è pronta per la trascrizione");

  const { data: meeting } = await db.from("board_meetings").select("id, minute_taker_id").eq("id", track.meeting_id).maybeSingle();
  const { data: presRole } = await db.from("user_roles").select("role").eq("user_id", uid).eq("role", "president").maybeSingle();
  const isManager = !!presRole || (!!meeting && meeting.minute_taker_id === uid);
  if (!isManager) return fail(403, "forbidden", "Solo il Presidente o il verbalizzante possono avviare la trascrizione");

  const { data: settings } = await db.from("board_ai_settings").select("*").eq("id", true).maybeSingle();
  if (!settings?.enabled) return fail(409, "ai_disabled", "La trascrizione IA è disattivata nelle impostazioni");

  const estimatedCost = ((track.duration_seconds ?? 0) / 60) * Number(settings.cost_per_min_eur);
  if (estimatedCost > Number(settings.max_cost_eur)) {
    return fail(422, "cost_limit", `Costo stimato €${estimatedCost.toFixed(2)} oltre il limite di €${Number(settings.max_cost_eur).toFixed(2)} per riunione`);
  }

  await db.rpc("board_audio_track_update_service", { _track: trackId, _status: "in_trascrizione" });

  try {
    const { data: file, error: dlError } = await db.storage.from("board-audio").download(track.storage_path);
    if (dlError || !file) throw new Error("file audio non raggiungibile");
    if (file.size > MAX_AUDIO_BYTES) throw new Error("file audio troppo grande");

    const form = new FormData();
    form.append("file", new File([file], "audio.webm", { type: file.type || "audio/webm" }));
    form.append("model", settings.transcription_model);
    form.append("response_format", "verbose_json");
    form.append("language", "it");

    const res = await fetch(`${settings.api_base.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    });
    if (!res.ok) throw new Error(`provider IA: risposta ${res.status}`);
    const out = await res.json();

    // Traccia individuale: il parlante è il titolare della traccia (attribuzione verificata).
    // Traccia condivisa: nessuna diarizzazione affidabile, ogni intervento resta non attribuito.
    let speaker: string | null = null;
    let attribution: Segment["attribution"] = "non_attribuita";
    if (track.kind === "individual" && track.participant_id) {
      const { data: part } = await db.from("board_meeting_participants").select("display_name").eq("id", track.participant_id).maybeSingle();
      speaker = part?.display_name ?? null;
      attribution = speaker ? "verificata" : "incerta";
    }
    const rawSegments: { start?: number; end?: number; text?: string }[] = Array.isArray(out?.segments) ? out.segments : [];
    const segments: Segment[] = (rawSegments.length ? rawSegments : [{ start: 0, end: track.duration_seconds ?? 0, text: out?.text }])
      .filter((s) => typeof s?.text === "string" && s.text.trim().length > 0)
      .map((s) => ({
        start: Number(s.start ?? 0), end: Number(s.end ?? 0),
        speaker, text: String(s.text).trim(), attribution,
      }));
    if (!segments.length) throw new Error("trascrizione vuota");

    const { error: saveError } = await db.rpc("board_audio_track_update_service", {
      _track: trackId, _status: "trascritta", _transcript: segments,
    });
    if (saveError) throw new Error(saveError.message);
    return json(200, { ok: true, request_id: requestId, segments: segments.length, estimated_cost_eur: Number(estimatedCost.toFixed(4)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "errore sconosciuto";
    await db.rpc("board_audio_track_update_service", { _track: trackId, _status: "errore", _error: message });
    return fail(502, "transcription_failed", message);
  }
});
