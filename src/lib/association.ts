import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// The external instance schema is installed separately; managed types stay untouched.
export const associationClient: SupabaseClient = supabase;
export const documentSchema = z.object({ kind: z.enum(["statute", "membership_form"]), path: z.string(), filename: z.string(), updated_at: z.string() });
export const personSchema = z.object({ user_id: z.string().uuid(), first_name: z.string().nullable(), last_name: z.string().nullable(), avatar_url: z.string().nullable(), roles: z.array(z.string()), sort_order: z.number() });
export type Person = z.infer<typeof personSchema>;
export const CATEGORY_ROLES = { founder: "Fondatore", ordinary: "Ordinario", supporter: "Sostenitore" } as const;
export const BOARD_ROLES = { president: "Presidente", vice_president: "Vicepresidente", secretary: "Segretario", treasurer: "Tesoriere", councillor: "Consigliere" } as const;
export const personName = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(" ") || "Nome non indicato";
export const boardRole = (p: Person) => (Object.keys(BOARD_ROLES) as (keyof typeof BOARD_ROLES)[]).find(r => p.roles.includes(r));
export const categoryRole = (p: Person) => (Object.keys(CATEGORY_ROLES) as (keyof typeof CATEGORY_ROLES)[]).find(r => p.roles.includes(r));
export async function loadPeople() {
  const { data, error } = await associationClient.rpc("list_association_people");
  if (error) throw new Error("Persone dell’associazione non ancora disponibili.");
  const people = z.array(personSchema).parse(data);
  const urls = await Promise.all(people.map(async p => p.avatar_url ? (await supabase.storage.from("avatars").createSignedUrl(p.avatar_url, 3600)).data?.signedUrl ?? null : null));
  return people.map((p, i) => ({ ...p, photo: urls[i] }));
}
export type PersonWithPhoto = Person & { photo: string | null };
export type AssociationDocument = z.infer<typeof documentSchema>;
export const membershipSchema = z.object({ full_name: z.string().trim().min(2, "Inserisci nome e cognome").max(100), email: z.string().trim().email("Email non valida").max(255), acknowledged: z.literal(true, { errorMap: () => ({ message: "Conferma di aver preso visione dello statuto" }) }) });
export const APPLICATION_STATUS = { draft: "Bozza", submitted: "Inviata", review: "In valutazione", approved: "Approvata dal Consiglio Direttivo", rejected: "Respinta" } as const;
export type ApplicationStatus = keyof typeof APPLICATION_STATUS;
export const submissionSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), full_name: z.string(), email: z.string(), file_path: z.string().nullable(), filename: z.string().nullable(), created_at: z.string(),
  status: z.enum(["draft", "submitted", "review", "approved", "rejected"]).default("submitted"),
  resolution_ref: z.string().nullable().optional(), resolution_date: z.string().nullable().optional(), decision_notes: z.string().nullable().optional(), member_id: z.string().nullable().optional(),
});
export const decisionSchema = z.object({
  decision: z.enum(["review", "approved", "rejected"]),
  category: z.enum(["Fondatore", "Ordinario", "Sostenitore", "Onorario"]).optional(),
  admission_date: z.string().optional(), resolution_ref: z.string().trim().max(80).optional(), resolution_date: z.string().optional(), notes: z.string().trim().max(1000).optional(),
});
/** Registers a Board decision. Approval creates/links the register entry and assigns the card number server-side. */
export async function decideApplication(id: string, input: z.infer<typeof decisionSchema>) {
  const v = decisionSchema.parse(input);
  const { error } = await associationClient.rpc("membership_decide", {
    _application: id, _decision: v.decision, _category: v.category ?? null, _admission_date: v.admission_date || null,
    _resolution_ref: v.resolution_ref || null, _resolution_date: v.resolution_date || null, _notes: v.notes || null,
  });
  if (error) throw new Error(error.message.includes("function") ? "Esegui prima lo script treasury-v5.sql" : error.message);
}
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
  const docs = await associationClient.from("association_documents").select("kind,path,filename,updated_at");
  if (docs.error) throw new Error("Materiali dell’associazione non ancora disponibili.");
  return { documents: z.array(documentSchema).parse(docs.data) };
}
export function publicAssociationFile(bucket: "association-documents", path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
export async function downloadMembership(path: string, filename: string) {
  const { data, error } = await supabase.storage.from("membership-submissions").download(path);
  if (error || !data) throw new Error("Impossibile scaricare il documento. Riprova più tardi.");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}