import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDossierZip, dossierAssets, MAX_DOSSIER_BYTES, sha256, verifyDossierZip } from "./zip.ts";

function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
async function download(db: SupabaseClient, path: string, maxBytes = MAX_DOSSIER_BYTES) {
  const { data, error } = await db.storage.from("board-documents").download(path);
  check(error);
  if (!data) throw new Error("Documento non disponibile");
  if (data.size > maxBytes) throw new Error("Documento oltre il limite di dimensione del fascicolo");
  return new Uint8Array(await data.arrayBuffer());
}

export async function createDossier(db: SupabaseClient, user: SupabaseClient, meetingId: string) {
  const { data: prepared, error } = await user.rpc("board_dossier_prepare", { _meeting: meetingId });
  check(error);
  const signed = await download(db, prepared.signed_path, 10 * 1024 * 1024);
  const assets:Record<string,Uint8Array>={};
  let total=signed.length+new TextEncoder().encode(prepared.snapshot).length;
  for(const asset of dossierAssets(prepared.snapshot)) {
    const file=await download(db,asset.path,10*1024*1024);
    total+=file.length;if(total>MAX_DOSSIER_BYTES)throw new Error("Dati e allegati del fascicolo oltre 25 MB");
    assets[asset.path]=file;
  }
  const bytes = await buildDossierZip(prepared.snapshot, signed,assets);
  const hash = await sha256(bytes);
  const path = `${meetingId}/fascicolo-${crypto.randomUUID()}.zip`;
  const { error: uploadError } = await db.storage.from("board-documents").upload(path, bytes, { contentType: "application/zip", upsert: false });
  check(uploadError);
  // Rilettura dello storage prima di registrare il fascicolo: un upload riuscito non basta.
  await verifyDossierZip(await download(db, path), prepared.snapshot, hash);
  // shortcut: la risposta RPC persa può lasciare ZIP orfani, ripulirli solo dopo riconciliazione per evitare perdita di atti.
  const { data: id, error: registerError } = await user.rpc("board_dossier_register", {
    _meeting: meetingId, _revision: prepared.revision, _storage_path: path, _sha256: hash,
  });
  check(registerError);
  return id as string;
}

export async function archiveDossier(db: SupabaseClient, user: SupabaseClient, dossierId: string, confirmed: boolean) {
  if (!confirmed) throw new Error("Confermare di avere scaricato e verificato il fascicolo");
  const { data: dossier, error } = await user.from("board_dossiers").select("*").eq("id", dossierId).single();
  check(error);
  if (!dossier) throw new Error("Fascicolo non disponibile");
  await verifyDossierZip(await download(db, dossier.storage_path), dossier.snapshot, dossier.sha256);
  const { error: beginError } = await user.rpc("board_dossier_begin_archive", { _dossier: dossierId });
  check(beginError);
  if (dossier.archived_at) return;

  // Si riparte dalla prima pagina dopo ogni rimozione: nessun oggetto saltato per effetto degli offset.
  const audio = db.storage.from("board-audio");
  for (;;) {
    const { data: files, error: listError } = await audio.list(dossier.meeting_id, { limit: 100, sortBy: { column: "name", order: "asc" } });
    check(listError);
    if (!files?.length) break;
    if (files.some((f) => !f.id || !/^[0-9a-f-]{36}\.webm$/.test(f.name))) {
      throw new Error("File audio inatteso: verifica manuale necessaria, archiviazione sospesa");
    }
    const paths = files.map((f) => `${dossier.meeting_id}/${f.name}`);
    const { data: removed, error: removeError } = await audio.remove(paths);
    check(removeError);
    if (removed?.length !== files.length) throw new Error("Rimozione audio incompleta: ripetere l'archiviazione");
  }
  const { error: finishError } = await db.rpc("board_dossier_finish_archive", { _dossier: dossierId });
  check(finishError);
}
