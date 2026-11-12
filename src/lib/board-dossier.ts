import { z } from "zod";
import { boardClient } from "@/lib/board";

const dossierSchema = z.object({
  id: z.string().uuid(), meeting_id: z.string().uuid(), storage_path: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/), created_at: z.string(),
  verified_at: z.string().nullable(), archived_at: z.string().nullable(),
});
export type Dossier = z.infer<typeof dossierSchema>;

export async function loadLatestDossier(meetingId: string): Promise<Dossier | null> {
  const { data, error } = await boardClient.from("board_dossiers")
    .select("id,meeting_id,storage_path,sha256,created_at,verified_at,archived_at")
    .eq("meeting_id", meetingId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? dossierSchema.parse(data) : null;
}

async function dossierAction(body: { action: "create"; meeting_id: string } | { action: "archive"; dossier_id: string; verified: true }) {
  const { data, error } = await boardClient.functions.invoke("board-dossier", { body });
  if (error) {
    const details = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof details?.message === "string" ? details.message : "Fascicolo non disponibile. Riprova.");
  }
  if (data?.ok !== true) throw new Error(data?.message || "Operazione sul fascicolo non riuscita");
}
export const createDossier = (meetingId: string) => dossierAction({ action: "create", meeting_id: meetingId });
export const archiveDossier = (dossierId: string) => dossierAction({ action: "archive", dossier_id: dossierId, verified: true });

export async function downloadDossier(dossier: Dossier): Promise<Blob> {
  const { data, error } = await boardClient.storage.from("board-documents").download(dossier.storage_path);
  if (error || !data) throw new Error("Impossibile scaricare il fascicolo. Riprova.");
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  if (hash !== dossier.sha256) throw new Error("Il fascicolo scaricato non supera la verifica di integrità. Non archiviare la seduta.");
  return data;
}
