// Consiglio Direttivo data access (external schema from setup/board-v15.sql, not in generated types).
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const boardClient: SupabaseClient = supabase;

export const MEETING_STATUS: Record<string, string> = {
  DRAFT: "Bozza", CONVOCATO: "Convocato", IN_CORSO: "In corso", VERBALE_IN_REVISIONE: "Verbale in revisione",
  APPROVATO: "Approvato", ESPORTATO: "Esportato", ARCHIVIATO: "Archiviato", ANNULLATO: "Annullato", SOSPESO: "Sospeso",
};
export const MODE_LABEL: Record<string, string> = { presenza: "In presenza", remoto: "Da remoto", ibrido: "Ibrida" };
export const AGENDA_KINDS: Record<string, string> = {
  comunicazione: "Comunicazione", discussione: "Discussione", deliberazione: "Deliberazione",
  approvazione_documento: "Approvazione documento", questione_economica: "Questione economica",
  ammissione_associati: "Ammissione associati", varie: "Varie ed eventuali",
};
export const BOARD_ROLE_LABEL: Record<string, string> = {
  president: "Presidente", vice_president: "Vicepresidente", secretary: "Segretario", treasurer: "Tesoriere", councillor: "Consigliere",
};

const participant = z.object({
  id: z.string(), user_id: z.string().nullable(), kind: z.enum(["member", "guest"]), display_name: z.string(),
  board_roles: z.array(z.string()), can_vote: z.boolean(), response: z.enum(["pending", "confirmed", "declined"]),
  present: z.boolean().default(false), attendance_requested_at: z.string().nullable().optional(),
  attendance_mode: z.enum(["presenza", "remoto"]).nullable().optional(), identified_at: z.string().nullable().optional(),
  attendance_note: z.string().nullable().optional(), last_seen_at: z.string().nullable().optional(),
});
const agendaItem = z.object({
  id: z.string(), position: z.number(), kind: z.string(), title: z.string(),
  description: z.string().nullable(), proposal: z.string().nullable(),
  discussion_status: z.enum(["pending", "current", "discussed"]).default("pending"),
});
const meeting = z.object({
  id: z.string(), meeting_year: z.number().nullable(), meeting_number: z.number().nullable(),
  scheduled_at: z.string(), location: z.string().nullable(), mode: z.enum(["presenza", "remoto", "ibrido"]),
  video_link: z.string().nullable(), description: z.string().nullable(), urgency_reason: z.string().nullable(),
  status: z.string(), status_reason: z.string().nullable(), minute_taker_id: z.string().nullable(),
  started_at: z.string().nullable().optional(), ended_at: z.string().nullable().optional(), active_agenda_id: z.string().nullable().optional(),
  board_meeting_participants: z.array(participant).default([]),
  board_agenda_items: z.array(agendaItem).default([]),
});
export type Meeting = z.infer<typeof meeting>;
export type Participant = z.infer<typeof participant>;
export type BoardMember = { user_id: string; first_name: string | null; last_name: string | null; roles: string[] };

export type MeetingDraft = {
  scheduled_at: string; mode: "presenza" | "remoto" | "ibrido"; location: string; video_link: string;
  description: string; urgency_reason: string; minute_taker_id: string;
  agenda: { key: string; kind: string; title: string; description: string; proposal: string }[];
  guests: { name: string }[];
};

const fail = (e: { message?: string } | null) => { if (e) throw new Error(e.message || "Operazione non riuscita"); };

export async function loadMeetings(): Promise<Meeting[]> {
  const { data, error } = await boardClient.from("board_meetings")
    .select("*, board_meeting_participants(*), board_agenda_items(*)").order("scheduled_at", { ascending: false });
  fail(error);
  return z.array(meeting).parse(data ?? []).map((m) => ({
    ...m, board_agenda_items: [...m.board_agenda_items].sort((a, b) => a.position - b.position),
  }));
}

export async function loadBoardMembers(): Promise<BoardMember[]> {
  const { data, error } = await boardClient.rpc("board_list_members");
  fail(error);
  return (data ?? []) as BoardMember[];
}

export function memberName(m: { first_name: string | null; last_name: string | null }) {
  return [m.first_name, m.last_name].filter(Boolean).join(" ") || "Componente senza nome";
}

/** Validates locally the same rules the database enforces; returns the first problem or null. */
export function draftProblem(d: MeetingDraft): string | null {
  if (!d.scheduled_at) return "Indica data e ora della riunione.";
  if (d.mode !== "remoto" && !d.location.trim()) return "Indica il luogo della riunione.";
  if (d.mode !== "presenza" && !/^https:\/\//.test(d.video_link.trim())) return "Inserisci il link della videoconferenza (https://…).";
  if (!d.agenda.length) return "Aggiungi almeno un punto all'ordine del giorno.";
  if (d.agenda.some((a) => !a.title.trim())) return "Ogni punto dell'ordine del giorno deve avere un titolo.";
  if (d.guests.some((g) => !g.name.trim())) return "Ogni invitato deve avere un nome.";
  return null;
}

export async function saveMeeting(id: string | null, d: MeetingDraft): Promise<string> {
  const payload = {
    ...d, scheduled_at: new Date(d.scheduled_at).toISOString(),
    agenda: d.agenda.map(({ kind, title, description, proposal }) => ({ kind, title, description, proposal })),
  };
  const { data, error } = await boardClient.rpc("board_save_meeting", { _id: id, _payload: payload });
  fail(error);
  return data as string;
}

export async function setMeetingStatus(id: string, status: string, reason?: string) {
  const { error } = await boardClient.rpc("board_set_status", { _id: id, _status: status, _reason: reason ?? null });
  fail(error);
}

export async function respondToMeeting(id: string, response: "confirmed" | "declined") {
  const { error } = await boardClient.rpc("board_respond", { _id: id, _response: response });
  fail(error);
}

export const meetingLabel = (m: Pick<Meeting, "meeting_number" | "meeting_year">) =>
  m.meeting_number ? `Riunione n. ${m.meeting_number}/${m.meeting_year}` : "Riunione (numero assegnato alla convocazione)";

export const quorumSchema = z.object({ total: z.number().int(), present: z.number().int(), required: z.number().int(), met: z.boolean() });
const eventSchema = z.object({ id: z.number(), action: z.string(), created_at: z.string(), detail: z.record(z.unknown()) });
export async function loadBoardSession(id: string) {
  const [q, e] = await Promise.all([
    boardClient.rpc("board_quorum", { _id: id }),
    boardClient.from("board_meeting_events").select("id,action,created_at,detail").eq("meeting_id", id).order("id", { ascending: false }).limit(100),
  ]);
  fail(q.error); fail(e.error);
  return { quorum: quorumSchema.parse(q.data), events: z.array(eventSchema).parse(e.data ?? []) };
}
export async function sessionAction(id: string, action: "open" | "suspend" | "resume" | "close", reason?: string) {
  const { error } = await boardClient.rpc("board_session_action", { _id: id, _action: action, _reason: reason ?? null }); fail(error);
}
export async function requestAttendance(id: string) {
  const { error } = await boardClient.rpc("board_attendance_request", { _id: id }); fail(error);
}
export async function recordAttendance(id: string, participantId: string, present: boolean, mode: string, verified: boolean, note: string) {
  const { error } = await boardClient.rpc("board_attendance_set", { _id: id, _participant: participantId, _present: present, _mode: mode, _verified: verified, _note: note }); fail(error);
}
export async function selectAgenda(id: string, agendaId: string) {
  const { error } = await boardClient.rpc("board_agenda_select", { _id: id, _agenda: agendaId }); fail(error);
}

export const romeDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
export const romeTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

/** Groups meetings for the dashboard. */
export function groupMeetings(list: Meeting[], now = new Date()) {
  const active = (m: Meeting) => ["CONVOCATO", "SOSPESO"].includes(m.status) && !m.started_at;
  const upcoming = list.filter((m) => active(m) && new Date(m.scheduled_at) >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return {
    next: upcoming[0] ?? null,
    upcoming,
    live: list.filter((m) => m.status === "IN_CORSO" || m.status === "SOSPESO" && !!m.started_at && !m.ended_at),
    drafts: list.filter((m) => m.status === "DRAFT"),
    concluded: list.filter((m) => !active(m) && !["DRAFT", "IN_CORSO"].includes(m.status) && !(m.status === "SOSPESO" && m.started_at && !m.ended_at) || active(m) && new Date(m.scheduled_at) < now),
  };
}

// ---- Phase 3: deliberations, recorded votes, document approval (setup/board-v17.sql) ----
export const DELIBERATION_STATUS: Record<string, string> = {
  BOZZA: "Bozza", IN_VOTAZIONE: "In votazione", APPROVATA: "Approvata", RESPINTA: "Respinta",
  SENZA_QUORUM: "Senza quorum", RITIRATA: "Ritirata",
};
export const VOTE_LABEL: Record<string, string> = { favorevole: "Favorevole", contrario: "Contrario", astenuto: "Astenuto" };
export const BALLOT_RESULT: Record<string, string> = { approvata: "Approvata", respinta: "Respinta", senza_quorum: "Senza quorum" };
export const DOCUMENT_KIND: Record<string, string> = { documento: "Documento", allegato: "Allegato", relazione: "Relazione" };

const versionSchema = z.object({
  id: z.string(), version: z.number(), title: z.string(), body: z.string(), content_hash: z.string(),
  created_by: z.string(), created_at: z.string(), locked_at: z.string().nullable().optional(),
});
const suggestionSchema = z.object({
  id: z.string(), author_name: z.string(), body: z.string(),
  status: z.enum(["nuova", "accolta", "non_accolta"]), created_at: z.string(), handled_at: z.string().nullable().optional(),
});
const documentSchema = z.object({
  id: z.string(), name: z.string(), kind: z.string(), status: z.enum(["bozza", "approvato", "respinto"]),
  approved_at: z.string().nullable().optional(),
});
const voteSchema = z.object({ id: z.string(), display_name: z.string(), vote: z.enum(["favorevole", "contrario", "astenuto"]), recorded_at: z.string() });
const ballotSchema = z.object({
  id: z.string(), status: z.enum(["aperta", "chiusa", "annullata"]), result: z.string().nullable(),
  tally: z.record(z.unknown()).default({}), quorum: z.record(z.unknown()).default({}),
  tie_break: z.boolean().default(false), reason: z.string().nullable().optional(),
  opened_at: z.string(), closed_at: z.string().nullable().optional(), board_votes: z.array(voteSchema).default([]),
});
const deliberationSchema = z.object({
  id: z.string(), meeting_id: z.string(), agenda_item_id: z.string().nullable(), number: z.number(),
  title: z.string(), status: z.string(), current_version: z.number(), closed_reason: z.string().nullable(),
  board_deliberation_versions: z.array(versionSchema).default([]),
  board_deliberation_suggestions: z.array(suggestionSchema).default([]),
  board_deliberation_documents: z.array(documentSchema).default([]),
  board_ballots: z.array(ballotSchema).default([]),
});
export type Deliberation = z.infer<typeof deliberationSchema>;
export type Ballot = z.infer<typeof ballotSchema>;
export type DeliberationDraft = { agenda_item_id: string; title: string; body: string; documents: { name: string; kind: string }[] };

/** Local mirror of the database checks; returns the first problem or null. */
export function deliberationProblem(d: DeliberationDraft): string | null {
  if (!d.title.trim()) return "Il titolo della delibera è obbligatorio.";
  if (d.title.trim().length > 300) return "Il titolo non può superare 300 caratteri.";
  if (!d.body.trim()) return "Il testo della delibera è obbligatorio.";
  if (d.body.trim().length > 20000) return "Il testo non può superare 20000 caratteri.";
  if (d.documents.some((x) => !x.name.trim())) return "Ogni documento deve avere un nome.";
  if (d.documents.length > 20) return "Una delibera può avere al massimo 20 documenti.";
  return null;
}

export async function loadDeliberations(meetingId: string): Promise<Deliberation[]> {
  const { data, error } = await boardClient.from("board_deliberations")
    .select("*, board_deliberation_versions(*), board_deliberation_suggestions(*), board_deliberation_documents(*), board_ballots(*, board_votes(*))")
    .eq("meeting_id", meetingId).order("number", { ascending: true });
  fail(error);
  return z.array(deliberationSchema).parse(data ?? []).map((d) => ({
    ...d,
    board_deliberation_versions: [...d.board_deliberation_versions].sort((a, b) => b.version - a.version),
    board_ballots: [...d.board_ballots].sort((a, b) => b.opened_at.localeCompare(a.opened_at))
      .map((b) => ({ ...b, board_votes: [...b.board_votes].sort((x, y) => x.recorded_at.localeCompare(y.recorded_at)) })),
  }));
}

/** The text version currently in force. */
export const currentVersion = (d: Deliberation) => d.board_deliberation_versions.find((v) => v.version === d.current_version) ?? null;
/** The vote in progress on this deliberation, if any. */
export const openBallotOf = (d: Deliberation) => d.board_ballots.find((b) => b.status === "aperta") ?? null;

/** Counts and name-by-name record of a vote: stored result once closed, live counts while open. */
export function ballotTally(b: Ballot) {
  if (b.status !== "aperta" && Object.keys(b.tally).length) {
    const nomi = Array.isArray(b.tally.nomi) ? (b.tally.nomi as { name: string; vote: string }[]) : [];
    return {
      favorevoli: Number(b.tally.favorevoli ?? 0), contrari: Number(b.tally.contrari ?? 0),
      astenuti: Number(b.tally.astenuti ?? 0), nomi,
    };
  }
  return {
    favorevoli: b.board_votes.filter((v) => v.vote === "favorevole").length,
    contrari: b.board_votes.filter((v) => v.vote === "contrario").length,
    astenuti: b.board_votes.filter((v) => v.vote === "astenuto").length,
    nomi: b.board_votes.map((v) => ({ name: v.display_name, vote: v.vote })),
  };
}

export async function saveDeliberation(meetingId: string, id: string | null, d: DeliberationDraft): Promise<string> {
  const { data, error } = await boardClient.rpc("board_deliberation_save", {
    _meeting: meetingId, _id: id,
    _payload: { agenda_item_id: d.agenda_item_id || null, title: d.title.trim(), body: d.body.trim(), documents: d.documents },
  });
  fail(error);
  return data as string;
}
export async function suggestDeliberation(deliberationId: string, body: string) {
  const { error } = await boardClient.rpc("board_deliberation_suggest", { _deliberation: deliberationId, _body: body }); fail(error);
}
export async function decideSuggestion(suggestionId: string, outcome: "accolta" | "non_accolta") {
  const { error } = await boardClient.rpc("board_deliberation_suggestion_decide", { _suggestion: suggestionId, _status: outcome }); fail(error);
}
export async function withdrawDeliberation(deliberationId: string, reason: string) {
  const { error } = await boardClient.rpc("board_deliberation_withdraw", { _deliberation: deliberationId, _reason: reason }); fail(error);
}
export async function openBallotFor(deliberationId: string): Promise<string> {
  const { data, error } = await boardClient.rpc("board_ballot_open", { _deliberation: deliberationId }); fail(error);
  return data as string;
}
export async function castVote(ballotId: string, vote: "favorevole" | "contrario" | "astenuto") {
  const { error } = await boardClient.rpc("board_ballot_vote", { _ballot: ballotId, _vote: vote }); fail(error);
}
export async function closeBallot(ballotId: string) {
  const { error } = await boardClient.rpc("board_ballot_close", { _ballot: ballotId }); fail(error);
}
export async function cancelBallot(ballotId: string, reason: string) {
  const { error } = await boardClient.rpc("board_ballot_cancel", { _ballot: ballotId, _reason: reason }); fail(error);
}
