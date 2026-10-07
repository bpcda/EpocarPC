import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// The external instance schema is installed separately; managed types stay untouched.
export const associationClient: SupabaseClient = supabase;
export const documentSchema = z.object({ kind: z.enum(["statute", "membership_form"]), path: z.string(), filename: z.string(), updated_at: z.string() });
export const founderSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100), biography: z.string().max(1000), photo_path: z.string().nullable(), sort_order: z.number() });
export type AssociationDocument = z.infer<typeof documentSchema>;
export type Founder = z.infer<typeof founderSchema>;
export const membershipSchema = z.object({ full_name: z.string().trim().min(2, "Inserisci nome e cognome").max(100), email: z.string().trim().email("Email non valida").max(255), acknowledged: z.literal(true, { errorMap: () => ({ message: "Conferma di aver preso visione dello statuto" }) }) });
export const submissionSchema = z.object({ id: z.string().uuid(), user_id: z.string().uuid(), full_name: z.string(), email: z.string(), file_path: z.string(), filename: z.string(), created_at: z.string() });
export type Submission = z.infer<typeof submissionSchema>;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const types: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export function validateAssociationFile(file: File, imageOnly = false) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!types[ext] || (imageOnly && !types[ext].startsWith("image/")) || (file.type && types[ext] !== file.type)) throw new Error("Formato non consentito: PDF, DOCX, JPG, PNG o WebP.");
  if (file.size === 0 || file.size > MAX_FILE_SIZE) throw new Error("Il file deve essere non vuoto e non superare 10 MB.");
  return { ext, contentType: types[ext] };
}
export async function loadAssociation() {
  const [docs, founders] = await Promise.all([
    associationClient.from("association_documents").select("kind,path,filename,updated_at"),
    associationClient.from("association_founders").select("*").order("sort_order").order("created_at"),
  ]);
  if (docs.error || founders.error) throw new Error("Materiali dell’associazione non ancora disponibili.");
  return { documents: z.array(documentSchema).parse(docs.data), founders: z.array(founderSchema).parse(founders.data) };
}
export function publicAssociationFile(bucket: "association-documents" | "association-media", path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
export async function downloadMembership(path: string, filename: string) {
  const { data, error } = await supabase.storage.from("membership-submissions").download(path);
  if (error || !data) throw new Error("Impossibile scaricare il documento. Riprova più tardi.");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}