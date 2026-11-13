import { boardClient } from "@/lib/board";
import { downloadBlob } from "@/lib/board-docx";

export const DOCUMENT_MIMES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export async function documentHash(file: Blob) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function uploadBoardDocument(id: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = DOCUMENT_MIMES[extension];
  if (!mime || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error("Usa PDF, immagini, testo, Word o Excel, fino a 10 MB.");
  const hash = await documentHash(file);
  const prepared = await boardClient.rpc("board_document_upload_prepare", {
    _document: id,
    _extension: extension,
  });
  if (prepared.error) throw new Error(prepared.error.message);
  const path = String(prepared.data);
  // shortcut: file non collegati restano privati; ripulirli dopo riconciliazione se diventano frequenti.
  const upload = await boardClient.storage
    .from("board-documents")
    .upload(path, file, { contentType: mime, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const saved = await boardClient.rpc("board_document_attach", {
    _document: id,
    _path: path,
    _sha256: hash,
    _size: file.size,
    _mime: mime,
  });
  if (saved.error) throw new Error(saved.error.message);
}
export async function downloadBoardDocument(
  path: string,
  hash: string,
  name: string,
) {
  const { data, error } = await boardClient.storage
    .from("board-documents")
    .download(path);
  if (error || !data) throw new Error("Allegato non disponibile");
  if ((await documentHash(data)) !== hash)
    throw new Error("L'allegato non supera la verifica di integrità");
  downloadBlob(data, name);
}
