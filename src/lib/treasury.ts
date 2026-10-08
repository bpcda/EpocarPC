import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATE_ACCOUNTS, TEMPLATE_CODES, TEMPLATE_LIMITS, TEMPLATE_MEMBER_CATEGORIES, TEMPLATE_METHODS } from "./treasury-template-lists";
import { buildWorkbook, budgetCodeRows, EXCEL_MAPPING, loadTemplate, type CellWrites } from "./treasury-excel";

// External-instance schema (public/setup/treasury.sql); managed types are not edited.
export const treasuryClient: SupabaseClient = supabase;
export const BUCKET = "treasury-documents";

export const CODES = TEMPLATE_CODES;
export const codeLabel = (code: string) => CODES.find((c) => c.code === code)?.label ?? "";
export const MEMBER_CATEGORIES = ["Fondatore", "Ordinario", "Sostenitore", "Onorario"] as const;

const num = z.union([z.number(), z.string()]).transform(Number);
export const transactionSchema = z.object({
  id: z.string().uuid(), fiscal_year: z.number(), movement_number: z.number().nullable(), transaction_date: z.string(),
  type: z.enum(["Entrata", "Uscita"]), excel_code: z.string(), description: z.string(), subject: z.string().nullable(),
  amount: num, payment_method: z.string(), account: z.string(), event_id: z.string().nullable(), member_id: z.string().nullable(),
  document_number: z.string().nullable(), document_date: z.string().nullable(), attachment_path: z.string().nullable(),
  attachment_name: z.string().nullable(), notes: z.string().nullable(), created_by: z.string(), created_at: z.string(),
  updated_at: z.string().nullable().optional(), deleted_at: z.string().nullable().optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;
export const memberSchema = z.object({
  id: z.string().uuid(), user_id: z.string().nullable(), full_name: z.string(), member_number: z.string().nullable(),
  category: z.string(), admission_date: z.string().nullable(), notes: z.string().nullable(), active: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;
export const budgetSchema = z.object({ id: z.string().uuid(), fiscal_year: z.number(), excel_code: z.string(), description: z.string().nullable(), planned_amount: num });
export type Budget = z.infer<typeof budgetSchema>;
export const feeSchema = z.object({
  id: z.string().uuid(), fiscal_year: z.number(), category: z.string(), amount: num, exempt: z.boolean(),
  resolution_number: z.string().nullable(), resolution_date: z.string().nullable(), document_path: z.string().nullable(),
  document_name: z.string().nullable(), notes: z.string().nullable(), created_by: z.string(), created_at: z.string(), superseded_at: z.string().nullable(),
});
export type Fee = z.infer<typeof feeSchema>;
export type FiscalYear = { year: number; status: "open" | "closed"; created_at?: string | null; closed_at?: string | null };

export const transactionInput = z.object({
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data obbligatoria"),
  type: z.enum(["Entrata", "Uscita"]),
  excel_code: z.string().refine((c) => CODES.some((x) => x.code === c), "Voce non valida"),
  description: z.string().trim().min(1, "Descrizione obbligatoria").max(500),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  amount: z.number({ invalid_type_error: "Importo non valido" }).positive("L'importo deve essere positivo").max(9_999_999),
  payment_method: z.enum(TEMPLATE_METHODS),
  account: z.enum(TEMPLATE_ACCOUNTS),
  event_id: z.string().uuid().nullable(),
  member_id: z.string().uuid().nullable(),
  document_number: z.string().trim().max(100).optional().or(z.literal("")),
  document_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
}).refine((v) => CODES.find((c) => c.code === v.excel_code)?.type === v.type, { message: "La voce non corrisponde al tipo", path: ["excel_code"] });
export type TransactionInput = z.infer<typeof transactionInput>;

export const memberInput = z.object({
  full_name: z.string().trim().min(2, "Nome obbligatorio").max(120),
  member_number: z.string().trim().max(20).optional().or(z.literal("")),
  category: z.enum(["Fondatore", "Ordinario", "Sostenitore", "Onorario"]),
  admission_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

const ATTACH: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
export function validateReceipt(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ATTACH[ext] || (file.type && file.type !== ATTACH[ext])) throw new Error("Giustificativo: solo PDF, JPG o PNG.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Il file deve essere non vuoto e sotto i 10 MB.");
  return { ext, contentType: ATTACH[ext] };
}

const fail = (e: { message: string } | null, msg: string) => { if (e) throw new Error(`${msg}: ${e.message}`); };

// The database has no row cap: read every page (the API returns at most 1000 rows per request).
const PAGE = 1000;
async function fetchAll<T>(q: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

export async function loadTreasury(year: number) {
  const [years, tx, members, budgets, events, fees] = await Promise.all([
    treasuryClient.from("treasury_fiscal_years").select("year,status,created_at,closed_at").order("year"),
    fetchAll(() => treasuryClient.from("treasury_transactions").select("*").eq("fiscal_year", year).is("deleted_at", null).order("transaction_date").order("created_at").order("id")),
    fetchAll(() => treasuryClient.from("association_members").select("*").order("full_name").order("id")),
    treasuryClient.from("treasury_budgets").select("*").eq("fiscal_year", year),
    supabase.from("events").select("id,title").order("date", { ascending: false }),
    treasuryClient.from("treasury_fee_schedules").select("*").eq("fiscal_year", year).order("created_at", { ascending: false }),
  ]);
  if (years.error || tx.error || members.error || budgets.error) throw new Error("Tesoreria non installata: esegui lo script SQL sulla tua istanza.");
  return {
    years: (years.data ?? []) as FiscalYear[],
    transactions: z.array(transactionSchema).parse(tx.data),
    members: z.array(memberSchema).parse(members.data),
    budgets: z.array(budgetSchema).parse(budgets.data),
    events: (events.data ?? []) as { id: string; title: string }[],
    // Missing v2 script → no fees yet; the UI asks to install it.
    fees: fees.error ? null : z.array(feeSchema).parse(fees.data),
  };
}
export type TreasuryData = Awaited<ReturnType<typeof loadTreasury>>;

const blank = (v?: string | null) => (v ? v : null);
export async function saveTransaction(year: number, input: TransactionInput, id: string | null, file: File | null, members: Member[]) {
  const v = transactionInput.parse(input);
  if (Number(v.transaction_date.slice(0, 4)) !== year) throw new Error(`La data deve essere nell'esercizio ${year}`);
  const member = members.find((m) => m.id === v.member_id);
  // Template rule: membership fees must use A.E.1 and the same name as "Quote Soci".
  const subject = member && v.excel_code === "A.E.1" ? member.full_name : blank(v.subject);
  const row = { ...v, fiscal_year: year, subject, document_number: blank(v.document_number), document_date: blank(v.document_date), notes: blank(v.notes) };
  let txId = id;
  if (id) {
    const { error } = await treasuryClient.from("treasury_transactions").update(row).eq("id", id);
    fail(error, "Salvataggio non riuscito");
  } else {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await treasuryClient.from("treasury_transactions").insert({ ...row, created_by: u.user?.id }).select("id").single();
    fail(error, "Salvataggio non riuscito");
    txId = data!.id;
  }
  if (file && txId) await attachReceipt(year, txId, file);
}

export async function attachReceipt(year: number, txId: string, file: File) {
  const { ext, contentType } = validateReceipt(file);
  const path = `${year}/${txId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  fail(up.error, "Caricamento giustificativo non riuscito");
  const { error } = await treasuryClient.from("treasury_transactions").update({ attachment_path: path, attachment_name: file.name.slice(0, 255) }).eq("id", txId);
  fail(error, "Collegamento giustificativo non riuscito");
}

export async function softDeleteTransaction(id: string) {
  const { error } = await treasuryClient.from("treasury_transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  fail(error, "Eliminazione non riuscita");
}

export async function openReceipt(path: string, filename: string, download: boolean) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60, download ? { download: filename } : undefined);
  if (error || !data) throw new Error("Documento non disponibile");
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function saveMember(input: z.infer<typeof memberInput>, id: string | null) {
  const v = memberInput.parse(input);
  const row = { ...v, member_number: blank(v.member_number), admission_date: blank(v.admission_date), notes: blank(v.notes) };
  const { error } = id ? await treasuryClient.from("association_members").update(row).eq("id", id) : await treasuryClient.from("association_members").insert(row);
  fail(error, "Salvataggio socio non riuscito");
}

export async function saveBudget(year: number, code: string, planned: number, description: string) {
  if (!Number.isFinite(planned) || planned < 0) throw new Error("Importo preventivo non valido");
  const { error } = await treasuryClient.from("treasury_budgets").upsert({ fiscal_year: year, excel_code: code, planned_amount: planned, description: description || null }, { onConflict: "fiscal_year,excel_code" });
  fail(error, "Salvataggio budget non riuscito");
}

export async function ensureYear(year: number) {
  const { error } = await treasuryClient.from("treasury_fiscal_years").insert({ year });
  fail(error, "Creazione esercizio non riuscita");
}
export async function setYearStatus(year: number, status: "open" | "closed") {
  const { error } = await treasuryClient.from("treasury_fiscal_years").update({ status, closed_at: status === "closed" ? new Date().toISOString() : null }).eq("year", year);
  fail(error, "Aggiornamento esercizio non riuscito");
}

/* ── Fees resolved by the Board, per fiscal year ── */
export const currentFees = (data: TreasuryData) => (data.fees ?? []).filter((f) => !f.superseded_at);
export const feeFor = (data: TreasuryData, category: string) => currentFees(data).find((f) => f.category === category) ?? null;
export const resolutionLabel = (f: Pick<Fee, "resolution_number" | "resolution_date">) =>
  f.resolution_number ? `Delibera CD n. ${f.resolution_number}${f.resolution_date ? ` del ${new Date(`${f.resolution_date}T00:00:00`).toLocaleDateString("it-IT")}` : ""}` : null;

export const feeInput = z.object({
  category: z.enum(MEMBER_CATEGORIES),
  amount: z.number({ invalid_type_error: "Importo non valido" }).min(0, "Importo non valido").max(100_000),
  exempt: z.boolean(),
  resolution_number: z.string().trim().max(50),
  resolution_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data non valida"),
  notes: z.string().trim().max(1000),
});
export async function saveFee(year: number, input: z.infer<typeof feeInput>, file: File | null) {
  const v = feeInput.parse(input);
  let path: string | null = null;
  if (file) {
    const { ext, contentType } = validateReceipt(file);
    path = `delibere/${year}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
    fail(up.error, "Caricamento delibera non riuscito");
  }
  const { error } = await treasuryClient.rpc("treasury_set_fee", {
    _year: year, _category: v.category, _amount: v.exempt ? 0 : v.amount, _exempt: v.exempt,
    _resolution_number: v.resolution_number, _resolution_date: v.resolution_date || null,
    _document_path: path, _document_name: file?.name.slice(0, 255) ?? null, _notes: v.notes,
  });
  fail(error, "Registrazione quota non riuscita");
}

/* ── Derived figures for the web dashboard (the Excel file computes its own) ── */
export function memberDues(data: TreasuryData, year: number) {
  return data.members.filter((m) => m.active).map((m) => {
    const pays = data.transactions.filter((t) => t.member_id === m.id && t.excel_code === "A.E.1" && t.type === "Entrata");
    const fee = feeFor(data, m.category);
    const due = fee ? fee.amount : 0, paid = pays.reduce((s, t) => s + t.amount, 0);
    const last = pays.map((t) => t.transaction_date).sort().pop() ?? null;
    const status = !fee ? "Quota non deliberata" : fee.exempt || due === 0 ? "Esente" : paid >= due ? "Pagato" : paid > 0 ? "Parzialmente pagato" : "Da pagare";
    return { member: m, due, paid, residual: Math.max(0, due - paid), last, method: pays.at(-1)?.payment_method ?? null, status, year };
  });
}
export function summary(data: TreasuryData, year: number) {
  const t = data.transactions, sum = (f: (x: Transaction) => boolean) => t.filter(f).reduce((s, x) => s + x.amount, 0);
  const inc = sum((x) => x.type === "Entrata"), out = sum((x) => x.type === "Uscita");
  const bal = (a: string) => sum((x) => x.account === a && x.type === "Entrata") - sum((x) => x.account === a && x.type === "Uscita");
  const dues = memberDues(data, year);
  const plannedIn = data.budgets.filter((b) => b.excel_code.includes(".E.")).reduce((s, b) => s + b.planned_amount, 0);
  const plannedOut = data.budgets.filter((b) => b.excel_code.includes(".U.")).reduce((s, b) => s + b.planned_amount, 0);
  return {
    inc, out, result: inc - out, bank: bal("Banca"), cash: bal("Cassa"),
    duesTotal: dues.reduce((s, d) => s + d.due, 0), duesPaid: dues.reduce((s, d) => s + Math.min(d.paid, d.due), 0), duesOpen: dues.reduce((s, d) => s + d.residual, 0),
    count: t.length, missingDocs: t.filter((x) => !x.attachment_path && !x.document_number).length,
    plannedIn, plannedOut, plannedResult: plannedIn - plannedOut, gap: inc - out - (plannedIn - plannedOut),
  };
}
export const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export const TEMPLATE_CAPACITY_MESSAGE = `Il template Excel ufficiale attualmente in uso supporta fino a ${TEMPLATE_LIMITS.movements} movimenti e ${TEMPLATE_LIMITS.members} soci per esercizio. I dati presenti nel gestionale sono integri, ma non possono essere esportati integralmente in questo modello. È necessario utilizzare un template aggiornato e validato`;

/* ── Excel export: database → input cells of the official template ── */
export async function buildExportWrites(data: TreasuryData): Promise<CellWrites> {
  const tx = data.transactions, members = data.members.filter((m) => m.active);
  // Capacity is a property of the current template only; data is never truncated.
  if (tx.length > TEMPLATE_LIMITS.movements || members.length > TEMPLATE_LIMITS.members) throw new Error(TEMPLATE_CAPACITY_MESSAGE + ` (presenti: ${tx.length} movimenti, ${members.length} soci).`);
  // The template computes dues with its own fixed fees: export only if the year's resolved fees match them.
  const mismatch = TEMPLATE_MEMBER_CATEGORIES.filter((c) => { const f = feeFor(data, c.name); return !f || f.amount !== c.fee; });
  if (mismatch.length) throw new Error(`Le quote deliberate per l'esercizio non coincidono con quelle del template Excel in uso (${TEMPLATE_MEMBER_CATEGORIES.map((c) => `${c.name} ${c.fee} €`).join(", ")}). Verificare: ${mismatch.map((c) => c.name).join(", ")}. Serve un template aggiornato e validato dal commercialista.`);
  const ev = new Map(data.events.map((e) => [e.id, e.title]));
  const M = EXCEL_MAPPING.Movimenti.columns, Q = EXCEL_MAPPING["Quote Soci"].columns;
  const date = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null);
  const mov: Record<string, unknown> = {};
  tx.forEach((t, i) => {
    const r = EXCEL_MAPPING.Movimenti.firstRow + i;
    const doc = [t.document_number, t.document_date ? new Date(t.document_date).toLocaleDateString("it-IT") : null].filter(Boolean).join(" del ") || (t.attachment_path ? t.attachment_name : null);
    Object.assign(mov, {
      [`${M.transaction_date}${r}`]: date(t.transaction_date), [`${M.movement_number}${r}`]: t.movement_number ?? i + 1, [`${M.type}${r}`]: t.type,
      [`${M.excel_code}${r}`]: t.excel_code, [`${M.description}${r}`]: t.description, [`${M.subject}${r}`]: t.subject, [`${M.document}${r}`]: doc,
      [`${M.payment_method}${r}`]: t.payment_method, [`${M.account}${r}`]: t.account, [`${M.amount}${r}`]: t.amount,
      [`${M.event}${r}`]: t.event_id ? ev.get(t.event_id) ?? null : null, [`${M.notes}${r}`]: t.notes,
    });
  });
  const quote: Record<string, unknown> = {};
  const dues = new Map(memberDues(data, 0).map((d) => [d.member.id, d]));
  members.forEach((m, i) => {
    const r = EXCEL_MAPPING["Quote Soci"].firstRow + i;
    Object.assign(quote, {
      [`${Q.member_number}${r}`]: m.member_number ?? String(i + 1), [`${Q.full_name}${r}`]: m.full_name, [`${Q.category}${r}`]: m.category,
      [`${Q.admission_date}${r}`]: date(m.admission_date), [`${Q.last_payment_date}${r}`]: date(dues.get(m.id)?.last ?? null), [`${Q.notes}${r}`]: m.notes,
    });
  });
  const rows = await budgetCodeRows((await loadTemplate()).zip);
  const budget: Record<string, unknown> = {};
  for (const b of data.budgets) {
    const r = rows[b.excel_code];
    if (!r) throw new Error(`La voce ${b.excel_code} non è prevista nel foglio Budget del template`);
    if (b.planned_amount) budget[`C${r}`] = b.planned_amount;
  }
  return { Movimenti: mov, "Quote Soci": quote, "Budget Previsionale": budget } as CellWrites;
}

export async function exportReport(data: TreasuryData, year: number) {
  const blob = await buildWorkbook(await buildExportWrites(data));
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const name = `EPOCAR_Tesoreria_Rendiconto_${year}_${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}.xlsx`;
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/* ── Single records, audit log and per-year totals (dedicated treasury pages) ── */
export async function loadTransaction(id: string) {
  const { data, error } = await treasuryClient.from("treasury_transactions").select("*").eq("id", id).maybeSingle();
  fail(error, "Movimento non disponibile");
  return data ? transactionSchema.parse(data) : null;
}

export const auditSchema = z.object({
  id: z.string().uuid(), table_name: z.string(), record_id: z.string().nullable(), operation: z.enum(["create", "update", "delete"]),
  old_data: z.record(z.unknown()).nullable(), new_data: z.record(z.unknown()).nullable(), changed_by: z.string().nullable(), created_at: z.string(),
});
export type AuditEntry = z.infer<typeof auditSchema>;
export const AUDIT_PAGE = 25;
export async function loadAudit(opts: { table?: string; recordId?: string; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  let q = treasuryClient.from("treasury_audit_log").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (opts.table) q = q.eq("table_name", opts.table);
  if (opts.recordId) q = q.eq("record_id", opts.recordId);
  const { data, error, count } = await q.range((page - 1) * AUDIT_PAGE, page * AUDIT_PAGE - 1);
  fail(error, "Registro modifiche non disponibile");
  return { rows: z.array(auditSchema).parse(data ?? []), total: count ?? 0 };
}

export async function loadYearTotals() {
  const r = await fetchAll(() => treasuryClient.from("treasury_transactions").select("fiscal_year,type,amount").is("deleted_at", null).order("id"));
  fail(r.error, "Totali non disponibili");
  const out = new Map<number, { count: number; inc: number; out: number }>();
  for (const t of (r.data ?? []) as { fiscal_year: number; type: string; amount: number | string }[]) {
    const o = out.get(t.fiscal_year) ?? { count: 0, inc: 0, out: 0 };
    o.count++; if (t.type === "Entrata") o.inc += Number(t.amount); else o.out += Number(t.amount);
    out.set(t.fiscal_year, o);
  }
  return out;
}

export async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new Error("Documento non disponibile");
  return data.signedUrl;
}
