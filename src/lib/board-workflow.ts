import { z } from "zod";
import { boardClient, type Meeting, type Minutes, currentMinutesVersion, loadDeliberations } from "./board";
import { convocationDocx, minutesDocx } from "./board-docx";

const job = z.object({ id: z.string(), status: z.string(), error: z.string().nullable(), result: z.string().nullable(),
  review_notes: z.array(z.string()), created_at: z.string(), expected_revision: z.number(), minutes_id: z.string() });
const check = (error: { message?: string } | null) => { if (error) throw new Error(error.message || "Operazione non riuscita"); };
export async function loadDocumentWorkflow(meetingId: string) {
  const [jobs, worker] = await Promise.all([
    boardClient.from("board_document_jobs").select("id,status,error,result,review_notes,created_at,expected_revision,minutes_id").eq("meeting_id", meetingId).order("created_at", { ascending: false }).limit(10),
    boardClient.rpc("board_document_worker_status", { _meeting: meetingId }),
  ]);
  check(jobs.error); check(worker.error);
  return { jobs: z.array(job).parse(jobs.data ?? []), worker: z.object({ paired: z.boolean(), online: z.boolean() }).parse(worker.data) };
}
export async function requestDocuments(meetingId: string, note: string) {
  const { data, error } = await boardClient.rpc("board_documents_request", { _meeting: meetingId, _coverage_note: note }); check(error); return z.string().parse(data);
}
export async function cancelDocuments(id: string) {
  const { error } = await boardClient.rpc("board_documents_cancel", { _job: id }); check(error);
}
export async function pairDocumentWorker(meetingId: string, whatsappTo: string) {
  if (whatsappTo && !/^\+[1-9]\d{7,14}$/.test(whatsappTo)) throw new Error("Usa il formato internazionale, per esempio +393331234567");
  const { data, error } = await boardClient.rpc("board_document_worker_register", { _meeting: meetingId }); check(error);
  return new Blob([JSON.stringify({ endpoint: "https://cgbaunizlqqhctiiogok.supabase.co/functions/v1/board-worker", token: z.string().regex(/^[0-9a-f]{64}$/).parse(data), whatsappTo: whatsappTo || null })], { type: "application/json" });
}
export async function revokeDocumentWorker() { const { error } = await boardClient.rpc("board_document_worker_revoke"); check(error); }

export async function reviewPackage(m: Meeting, minutes: Minutes, notes: string[]) {
  const version = currentMinutesVersion(minutes);
  if (!version) throw new Error("Salva prima una versione del verbale");
  const [{ default: JSZip }, deliberations] = await Promise.all([import("jszip"), loadDeliberations(m.id)]);
  const zip = new JSZip();
  zip.file("LEGGIMI.txt", `PACCHETTO PER REVISIONE — EPOCAR\nSeduta ${m.id}\nVerbale versione ${version.version}; stato ${minutes.status}.\nLe bozze non costituiscono atti firmati. Il fascicolo definitivo si prepara dopo le firme.\n\nPunti da verificare:\n${notes.map(n => `- ${n}`).join("\n")}`);
  zip.file("Convocazione.docx", await (await convocationDocx(m)).arrayBuffer());
  zip.file("Verbale_da_revisionare.docx", await (await minutesDocx(m, version.body, version.version, minutes.status === "APPROVATO")).arrayBuffer());
  zip.file("Presenze.txt", m.board_meeting_participants.map(p => `${p.display_name} · ${p.kind === "guest" ? "invitato senza voto" : "componente"} · ${p.present && p.identified_at ? "presenza identificata" : "non confermata"} · ${p.attendance_mode ?? "—"}`).join("\n"));
  zip.file("Delibere_e_votazioni.json", JSON.stringify(deliberations, null, 2));
  zip.file("Seduta.json", JSON.stringify({ schema_version: 1, purpose: "revisione", meeting: m, minutes_id: minutes.id, version: version.version, content_hash: version.content_hash, status: minutes.status }, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
