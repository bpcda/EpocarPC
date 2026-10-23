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
  id: z.number(), participant_id: z.string(), user_id: z.string(),
  consented: z.boolean(), notice_version: z.string(), created_at: z.string(),
});
export type RecordingConsent = z.infer<typeof consentSchema>;

const aiSettingsSchema = z.object({
  enabled: z.boolean(), provider: z.string(), api_base: z.string(), transcription_model: z.string(),
  drafting_model: z.string().default("gpt-4o-mini"),
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

export async function startAudioTrack(meetingId: string, kind: "individual" | "shared"): Promise<string> {
  const { data, error } = await boardClient.rpc("board_audio_track_start", { _meeting: meetingId, _kind: kind });
  fail(error);
  return data as string;
}

export const trackStoragePath = (meetingId: string, trackId: string) => `${meetingId}/${trackId}.webm`;

export async function finishAudioTrack(meetingId: string, trackId: string, blob: Blob, durationSeconds: number) {
  const path = trackStoragePath(meetingId, trackId);
  const { error: upError } = await boardClient.storage.from("board-audio").upload(path, blob, { contentType: "audio/webm", upsert: false });
  fail(upError);
  const { error } = await boardClient.rpc("board_audio_track_finish", {
    _track: trackId, _storage_path: path, _duration: Math.max(0, Math.round(durationSeconds)),
  });
  fail(error);
}

export async function deleteAudioTrack(meetingId: string, trackId: string) {
  await boardClient.storage.from("board-audio").remove([trackStoragePath(meetingId, trackId)]);
  const { error } = await boardClient.rpc("board_audio_track_delete", { _track: trackId });
  fail(error);
}

export async function transcribeTrack(trackId: string) {
  const { data, error } = await boardClient.functions.invoke("board-transcribe", { body: { track_id: trackId } });
  if (error) throw new Error(error.message || "Trascrizione non riuscita");
  if (data && data.ok === false) throw new Error(data.message || "Trascrizione non riuscita");
}

export async function saveAiSettings(s: AiSettings) {
  const { error } = await boardClient.rpc("board_ai_settings_save", {
    _enabled: s.enabled, _provider: s.provider, _api_base: s.api_base,
    _transcription_model: s.transcription_model, _drafting_model: s.drafting_model,
    _cost_per_min_eur: s.cost_per_min_eur, _max_cost_eur: s.max_cost_eur, _notice_version: s.notice_version,
  });
  fail(error);
}

export const formatDuration = (seconds: number | null) => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Informativa mostrata prima del consenso (versione in board_ai_settings.notice_version). */
export const RECORDING_NOTICE = [
  "La seduta può essere registrata esclusivamente per la redazione del verbale della riunione.",
  "Le registrazioni sono conservate in un'area riservata ai componenti del Consiglio Direttivo e possono essere trattate da un servizio di trascrizione automatica configurato dall'associazione.",
  "Le registrazioni e le trascrizioni sono eliminate dopo l'approvazione del verbale e l'esportazione del fascicolo della seduta.",
  "Il mancato consenso alla registrazione non comporta l'esclusione dalla riunione: il verbalizzante prenderà appunti manualmente.",
].join(" ");
