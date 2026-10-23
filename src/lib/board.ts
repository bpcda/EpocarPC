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
});
const agendaItem = z.object({
  id: z.string(), position: z.number(), kind: z.string(), title: z.string(),
  description: z.string().nullable(), proposal: z.string().nullable(),
});
const meeting = z.object({
  id: z.string(), meeting_year: z.number().nullable(), meeting_number: z.number().nullable(),
  scheduled_at: z.string(), location: z.string().nullable(), mode: z.enum(["presenza", "remoto", "ibrido"]),
  video_link: z.string().nullable(), description: z.string().nullable(), urgency_reason: z.string().nullable(),
  status: z.string(), status_reason: z.string().nullable(), minute_taker_id: z.string().nullable(),
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

export const romeDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
export const romeTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

/** Groups meetings for the dashboard. */
export function groupMeetings(list: Meeting[], now = new Date()) {
  const active = (m: Meeting) => ["CONVOCATO", "SOSPESO"].includes(m.status);
  const upcoming = list.filter((m) => active(m) && new Date(m.scheduled_at) >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return {
    next: upcoming[0] ?? null,
    upcoming,
    live: list.filter((m) => m.status === "IN_CORSO"),
    drafts: list.filter((m) => m.status === "DRAFT"),
    concluded: list.filter((m) => !active(m) && !["DRAFT", "IN_CORSO"].includes(m.status) || active(m) && new Date(m.scheduled_at) < now),
  };
}
