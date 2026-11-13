// Consiglio Direttivo — Fase 4: consenso alla registrazione, tracce audio, trascrizione IA (setup/board-v18.sql).
import { z } from "zod";
import { boardClient } from "@/lib/board";

export const TRACK_STATUS: Record<string, string> = {
  in_registrazione: "Registrazione in corso", caricata: "Caricata", in_trascrizione: "Trascrizione in corso",
  trascritta: "Trascritta", errore: "Errore di trascrizione",
};
export const ATTRIBUTION_LABEL: Record<string, string> = {
  verificata: "Attribuzione verificata", incerta: "Attribuzione incerta", non_attribuita: "Intervento non attribuito con certezza",
};

export const transcriptSegment = z.object({
  start: z.number(), end: z.number(), speaker: z.string().nullable(),
  text: z.string(), attribution: z.enum(["verificata", "incerta", "non_attribuita"]),
});
export type TranscriptSegment = z.infer<typeof transcriptSegment>;

const trackSchema = z.object({
  id: z.string(), meeting_id: z.string(), participant_id: z.string().nullable(),
  kind: z.enum(["individual", "shared"]), status: z.string(),
  storage_path: z.string().nullable(), started_at: z.string(), ended_at: z.string().nullable(),
  duration_seconds: z.number().nullable(), transcript: z.array(transcriptSegment).nullable(),
  transcript_error: z.string().nullable(), created_by: z.string(),
});
export type AudioTrack = z.infer<typeof trackSchema>;

const consentSchema = z.object({
  id: z.number(), participant_id: z.string(), user_id: z.string().nullable(),
  consented: z.boolean(), notice_version: z.string(), created_at: z.string(),
});
export type RecordingConsent = z.infer<typeof consentSchema>;

const aiSettingsSchema = z.object({
  enabled: z.boolean(), provider: z.string(), api_base: z.string(), transcription_model: z.string(),
  drafting_model: z.string().default("gpt-4o-mini"),
  draft_input_per_million_eur: z.coerce.number().nullable().optional(), draft_output_per_million_eur: z.coerce.number().nullable().optional(), draft_max_tokens: z.number().default(4000),
  cost_per_min_eur: z.coerce.number(), max_cost_eur: z.coerce.number(), notice_version: z.string(),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

const fail = (e: { message?: string } | null) => { if (e) throw new Error(e.message || "Operazione non riuscita"); };

export async function loadAudioData(meetingId: string) {
  const [tracks, consents, settings] = await Promise.all([
    boardClient.from("board_audio_tracks").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    boardClient.from("board_recording_consents").select("*").eq("meeting_id", meetingId).order("id", { ascending: false }),
    boardClient.from("board_ai_settings").select("*").eq("id", true).maybeSingle(),
  ]);
  fail(tracks.error); fail(consents.error); fail(settings.error);
  return {
    tracks: z.array(trackSchema).parse(tracks.data ?? []),
    consents: z.array(consentSchema).parse(consents.data ?? []),
    settings: settings.data ? aiSettingsSchema.parse(settings.data) : null,
  };
}

/** Latest consent of a participant, if any. */
export const currentConsent = (consents: RecordingConsent[], participantId: string) =>
  consents.find((c) => c.participant_id === participantId) ?? null;

export async function setRecordingConsent(meetingId: string, consented: boolean, noticeVersion: string) {
  const { error } = await boardClient.rpc("board_recording_consent_set", {
    _meeting: meetingId, _consented: consented, _notice_version: noticeVersion,
  });
  fail(error);
}

export async function startAudioTrack(meetingId: string, kind: "individual" | "shared", participants: string[] | null = null, evidence: string | null = null): Promise<string> {
  const { data, error } = await boardClient.rpc("board_audio_track_start_with_participants", { _meeting: meetingId, _kind: kind, _participants: participants, _evidence: evidence });
  fail(error);
  return data as string;
}

export const trackStoragePath = (meetingId: string, trackId: string) => `${meetingId}/${trackId}.webm`;

export async function finishAudioTrack(meetingId: string, trackId: string, blob: Blob, durationSeconds: number) {
  const path = trackStoragePath(meetingId, trackId);
  const { error: upError } = await boardClient.storage.from("board-audio").upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false });
  if (upError) {
    const stored = await boardClient.storage.from("board-audio").download(path);
    fail(stored.error);
    if (!stored.data || await hashBlob(stored.data) !== await hashBlob(blob)) throw new Error("Caricamento non riuscito: copia locale conservata");
  }
  const { error } = await boardClient.rpc("board_audio_track_finish", {
    _track: trackId, _storage_path: path, _duration: Math.max(1, Math.ceil(durationSeconds)),
  });
  fail(error);
}

export async function deleteAudioTrack(meetingId: string, trackId: string) {
  await boardClient.storage.from("board-audio").remove([trackStoragePath(meetingId, trackId)]);
  const { error } = await boardClient.rpc("board_audio_track_delete", { _track: trackId });
  fail(error);
}

async function hashBlob(blob: Blob) {
  const hash=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");
}
export async function recordingLease(trackId:string) {
  const {data,error}=await boardClient.rpc("board_recording_lease",{_track:trackId}).abortSignal(AbortSignal.timeout(4000));fail(error);return data===true;
}
export async function abortAudioTrack(trackId:string) { const {error}=await boardClient.rpc("board_audio_track_abort",{_track:trackId,_reason:"Microfono o salvataggio locale non avviato"});fail(error); }
export async function setGuestConsent(meetingId:string,participantId:string,consented:boolean,evidence:string) {
  const {error}=await boardClient.rpc("board_guest_consent_set",{_meeting:meetingId,_participant:participantId,_consented:consented,_evidence:evidence});fail(error);
}
export async function transcribeTrack(trackId: string) {
  await invokeBoardAi("board-transcribe", { track_id: trackId }, `transcribe:${trackId}`);
}
export async function invokeBoardAi(name:string,body:Record<string,string>,key:string) {
  const storageKey=`board-ai:${key}`;
  const requestId=sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,requestId);
  const { data, error } = await boardClient.functions.invoke(name, { body: {...body,request_id:requestId} });
  if (error) {
    // Keep the id on network failure: retry queries the existing job instead of charging again.
    const response=error.context;
    if(response instanceof Response) {
      const result=await response.json().catch(()=>null);
      if(result?.job_id)sessionStorage.removeItem(storageKey);
      throw new Error(result?.message??"Elaborazione non riuscita");
    }
    throw new Error(error.message || "Elaborazione non riuscita");
  }
  if(!data?.pending)sessionStorage.removeItem(storageKey);
  if (data?.ok === false && !data.pending) throw new Error(data.message || "Elaborazione non riuscita");
}
export async function loadAiJobs(meetingId:string) {
  const [jobs,usage]=await Promise.all([boardClient.from("board_ai_jobs").select("id,kind,status,error,result,created_at,started_at,reserved_cost").eq("meeting_id",meetingId).order("created_at",{ascending:false}),boardClient.rpc("board_ai_usage",{_meeting:meetingId})]);
  fail(jobs.error);fail(usage.error);
  return {jobs:z.array(z.object({id:z.string(),kind:z.string(),status:z.string(),error:z.string().nullable(),result:z.string().nullable(),created_at:z.string(),started_at:z.string().nullable(),reserved_cost:z.coerce.string()})).parse(jobs.data),usage:z.object({reserved:z.string(),limit:z.string()}).parse(usage.data)};
}
export async function interruptAiJob(id:string) {const {error}=await boardClient.rpc("board_ai_job_interrupt",{_job:id});fail(error);}
export async function saveAiSettings(s: AiSettings) {
  const { error } = await boardClient.rpc("board_ai_settings_configure", {_settings:s});fail(error);
}

export const formatDuration = (seconds: number | null) => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Informativa mostrata prima del consenso (versione in board_ai_settings.notice_version). */
export const RECORDING_NOTICE = [
  "La seduta può essere registrata esclusivamente per la redazione del verbale della riunione.",
  "Le registrazioni sono conservate in un'area riservata al Consiglio. La routine personale può trascriverle sul PC autorizzato e inviare i testi necessari a Codex/OpenAI per preparare una bozza; l'eventuale servizio API alternativo resta distinto.",
  "La bozza può essere revisionata dopo la chiusura. Registrazioni e trascrizioni temporanee vengono eliminate con conferma dopo la sottoscrizione e la verifica del fascicolo.",
  "Il mancato consenso alla registrazione non comporta l'esclusione dalla riunione: il verbalizzante prenderà appunti manualmente.",
].join(" ");
