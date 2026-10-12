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
export const APPLICATION_STATUS = { draft: "Bozza", submitted: "Domanda ricevuta", review: "Domanda in valutazione", approved: "Approvata dal Consiglio Direttivo", rejected: "Respinta", cancelled: "Annullata" } as const;
export const APPLICATION_STATUSES = ["draft", "submitted", "review", "approved", "rejected", "cancelled"] as const;
export type ApplicationStatus = keyof typeof APPLICATION_STATUS;
export const submissionSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), full_name: z.string(), email: z.string(), file_path: z.string().nullable(), filename: z.string().nullable(), created_at: z.string(),
  status: z.enum(APPLICATION_STATUSES).default("submitted"),
  submitted_at: z.string().nullable().optional(), approved_at: z.string().nullable().optional(), rejected_at: z.string().nullable().optional(),
  public_status_message: z.string().nullable().optional(),
  resolution_ref: z.string().nullable().optional(), resolution_date: z.string().nullable().optional(), decision_notes: z.string().nullable().optional(), member_id: z.string().nullable().optional(),
});
/** Applicant-editable fields only: decisions and Treasury-governed data are never sent from the browser. */
export const APPLICANT_FIELDS = ["full_name", "email", "file_path", "filename", "status", "requested_category", "first_name", "last_name", "birth_date", "birth_place", "tax_code", "phone", "address", "postal_code", "city", "province", "motivation", "applicant_notes", "statute_accepted_at", "regulation_accepted_at", "admission_requested_at", "rules_commitment_at", "privacy_accepted_at", "communications_consent_at", "declarations_version", "application_kind"] as const;
export function applicantPayload(fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of APPLICANT_FIELDS) if (k in fields) out[k] = fields[k];
  if (out.status !== undefined && out.status !== "draft" && out.status !== "submitted") throw new Error("Stato non consentito");
  return out;
}
/** Area Socio: limited projection written only by the private Treasury (own row only, via RLS). */
export const memberStatusSchema = z.object({
  membership_status: z.enum(["active", "suspended", "ceased"]),
  category: z.enum(["Fondatore", "Ordinario", "Sostenitore", "Onorario"]),
  card_number: z.number().int().positive().nullable(),
  admission_date: z.string().nullable(),
  membership_year: z.number().int().nullable(),
  fee_status: z.enum(["paid", "partial", "due", "exempt"]).nullable(),
  updated_at: z.string(),
});
export type MemberStatus = z.infer<typeof memberStatusSchema>;
export const MEMBERSHIP_STATUS = { active: "Socio", suspended: "Socio sospeso", ceased: "Non più socio" } as const;
export const FEE_STATUS = { paid: "Quota pagata", partial: "Quota pagata in parte", due: "Quota da pagare", exempt: "Esente" } as const;
export const cardLabel = (n: number | null | undefined) => (n == null ? "Tessera non ancora assegnata" : `n. ${n}`);
export async function loadMyMembership(userId: string) {
  const [app, mem] = await Promise.all([
    associationClient.from("membership_applications").select("*").eq("user_id", userId).maybeSingle(),
    associationClient.from("member_public_status").select("membership_status,category,card_number,admission_date,membership_year,fee_status,updated_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (app.error) throw new Error("Area socio non disponibile.");
  return { application: app.data ? submissionSchema.parse(app.data) : null, member: !mem.error && mem.data ? memberStatusSchema.parse(mem.data) : null };
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
/* ---------- Domanda di ammissione elettronica (setup/membership-application-v7.sql) ---------- */
export const DECLARATIONS_VERSION = "2026-10";
export const REQUESTED_CATEGORIES = ["Ordinario", "Sostenitore"] as const;
export const DECLARATIONS = [
  { key: "statute_accepted_at", label: "Dichiaro di aver preso visione dello Statuto dell’Associazione EPOCAR.", required: true },
  { key: "regulation_accepted_at", label: "Dichiaro di aver preso visione dell’eventuale Regolamento interno, ove adottato.", required: true },
  { key: "admission_requested_at", label: "Chiedo formalmente di essere ammesso/a come socio dell’Associazione EPOCAR.", required: true },
  { key: "rules_commitment_at", label: "Mi impegno a rispettare lo Statuto, i regolamenti e le deliberazioni degli organi associativi.", required: true },
  { key: "privacy_accepted_at", label: "Dichiaro di aver letto l’informativa sul trattamento dei dati personali.", required: true },
  { key: "communications_consent_at", label: "Acconsento a ricevere comunicazioni informative sulle attività dell’Associazione (facoltativo).", required: false },
] as const;
export type DeclarationKey = (typeof DECLARATIONS)[number]["key"];
const req = (m: string, max: number) => z.string().trim().min(1, m).max(max, "Testo troppo lungo");
export const personalStep = z.object({
  first_name: req("Inserisci il nome", 60), last_name: req("Inserisci il cognome", 60),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci la data di nascita").refine(d => { const t = Date.parse(d); return t >= Date.parse("1900-01-01") && t <= Date.now(); }, "Data non valida"),
  birth_place: req("Inserisci il luogo di nascita", 80),
  tax_code: z.string().trim().toUpperCase().regex(/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/, "Codice fiscale non valido"),
  email: z.string().trim().email("Email non valida").max(255),
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Telefono non valido"),
  address: req("Inserisci l’indirizzo", 120),
  postal_code: z.string().trim().regex(/^[0-9]{5}$/, "CAP di 5 cifre"),
  city: req("Inserisci il comune", 80),
  province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Sigla di 2 lettere (es. PC)"),
});
export const associativeStep = z.object({
  requested_category: z.enum(REQUESTED_CATEGORIES, { errorMap: () => ({ message: "Scegli la categoria" }) }),
  motivation: z.string().trim().max(1000, "Massimo 1000 caratteri"),
  applicant_notes: z.string().trim().max(1000, "Massimo 1000 caratteri"),
});
export const declarationsStep = z.object(Object.fromEntries(DECLARATIONS.map(d => [d.key, d.required ? z.literal(true, { errorMap: () => ({ message: "Dichiarazione obbligatoria" }) }) : z.boolean()])) as Record<DeclarationKey, z.ZodTypeAny>);
export type ApplicationForm = z.infer<typeof personalStep> & z.infer<typeof associativeStep> & Record<DeclarationKey, boolean>;
export const emptyForm = (): ApplicationForm => ({ first_name: "", last_name: "", birth_date: "", birth_place: "", tax_code: "", email: "", phone: "", address: "", postal_code: "", city: "", province: "", requested_category: "" as never, motivation: "", applicant_notes: "", statute_accepted_at: false, regulation_accepted_at: false, admission_requested_at: false, rules_commitment_at: false, privacy_accepted_at: false, communications_consent_at: false });
/** Field errors keyed by field name, for inline messages. */
export function stepErrors(schema: z.ZodTypeAny, values: unknown): Record<string, string> {
  const r = schema.safeParse(values); if (r.success) return {};
  const out: Record<string, string> = {}; for (const i of r.error.issues) { const k = String(i.path[0]); out[k] ??= i.message; } return out;
}
/** Row → form (draft resume). Declarations become checked only if the stored timestamp exists. */
export function formFromRow(row: Record<string, unknown>, fallback: ApplicationForm): ApplicationForm {
  const f = { ...fallback };
  for (const k of Object.keys(f) as (keyof ApplicationForm)[]) {
    const v = row[k];
    if (DECLARATIONS.some(d => d.key === k)) (f as Record<string, unknown>)[k] = Boolean(v);
    else if (typeof v === "string" && v) (f as Record<string, unknown>)[k] = v;
  }
  return f;
}
/** Form → applicant-only payload. Status is the only workflow field and only draft/submitted. Server sets submitted_at. */
export function electronicPayload(f: ApplicationForm, status: "draft" | "submitted", previous?: Record<string, unknown> | null) {
  const empty = (s: string) => (s.trim() ? s.trim() : null);
  const now = new Date().toISOString();
  const out: Record<string, unknown> = {
    application_kind: "electronic", status, declarations_version: DECLARATIONS_VERSION,
    full_name: `${f.first_name.trim()} ${f.last_name.trim()}`.trim() || "Bozza",
    first_name: empty(f.first_name), last_name: empty(f.last_name), birth_date: f.birth_date || null, birth_place: empty(f.birth_place),
    tax_code: empty(f.tax_code.toUpperCase()), email: f.email.trim(), phone: empty(f.phone), address: empty(f.address),
    postal_code: empty(f.postal_code), city: empty(f.city), province: empty(f.province.toUpperCase()),
    requested_category: f.requested_category || null, motivation: empty(f.motivation), applicant_notes: empty(f.applicant_notes),
  };
  for (const d of DECLARATIONS) out[d.key] = f[d.key] ? ((previous?.[d.key] as string | undefined) ?? now) : null;
  // Draft values that fail DB format checks are dropped rather than blocking the save.
  if (status === "draft") {
    for (const k of ["tax_code", "phone", "postal_code", "province", "birth_date"] as const) {
      const r = personalStep.shape[k].safeParse(out[k] ?? ""); if (!r.success) out[k] = null;
    }
  }
  return out;
}
