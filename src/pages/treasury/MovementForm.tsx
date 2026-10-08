import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CODES, euro, loadTransaction, memberLabel, memberDues, saveTransaction, type TransactionInput } from "@/lib/treasury";
import { TEMPLATE_ACCOUNTS, TEMPLATE_METHODS } from "@/lib/treasury-template-lists";
import { ErrorBox, Loading, PageHeader, selectCls, useRefreshTreasury, useSessionDraft, useTreasuryData, useUnsavedGuard } from "@/components/treasury/shared";

const empty = (year: number): TransactionInput => ({
  transaction_date: `${year}-${new Date().toISOString().slice(5, 10)}`, type: "Uscita", excel_code: "A.U.2", description: "", subject: "",
  amount: 0, payment_method: "Bonifico", account: "Banca", event_id: null, member_id: null, document_number: "", document_date: "", notes: "",
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border border-border bg-card p-4 space-y-4">
      <legend className="px-2 font-headline text-lg tracking-widest uppercase text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}
const F = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => <div className={`space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>;
const inp = "h-11 text-base md:text-sm";

/** Shared by /tesoreria/movimenti/nuovo and /tesoreria/movimenti/:id/modifica. */
export default function MovementForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const refresh = useRefreshTreasury();
  const existing = useQuery({ queryKey: ["treasury-tx", id], queryFn: () => loadTransaction(id!), enabled: !!id });
  const year = existing.data?.fiscal_year ?? (Number(sp.get("anno")) || Math.max(2026, new Date().getFullYear()));
  const { data, error, isLoading } = useTreasuryData(year);
  const draft = useSessionDraft<TransactionInput>(id ? `edit-${id}` : `new-${year}-${sp.get("socio") ?? ""}`);

  const [v, setV] = useState<TransactionInput | null>(null);
  const [initial, setInitial] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (v || !data || (id && !existing.data)) return;
    let base: TransactionInput;
    if (existing.data) {
      const t = existing.data;
      base = { transaction_date: t.transaction_date, type: t.type, excel_code: t.excel_code, description: t.description, subject: t.subject ?? "", amount: t.amount,
        payment_method: t.payment_method as TransactionInput["payment_method"], account: t.account as TransactionInput["account"], event_id: t.event_id, member_id: t.member_id,
        document_number: t.document_number ?? "", document_date: t.document_date ?? "", notes: t.notes ?? "" };
    } else {
      base = empty(year);
      const socio = sp.get("socio"), m = data.members.find((x) => x.id === socio);
      if (m) base = { ...base, type: "Entrata", excel_code: "A.E.1", member_id: m.id, subject: m.full_name, description: `Quota associativa ${year}`, amount: memberDues(data, year).find((d) => d.member.id === m.id)?.residual ?? 0 };
    }
    setInitial(JSON.stringify(base));
    const saved = draft.read();
    if (saved) toast.info("Ripristinata la bozza non salvata di questo modulo.");
    setV(saved ?? base);
  }, [data, existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!v && (JSON.stringify(v) !== initial || !!file);
  const canLeave = useUnsavedGuard(dirty && !busy);
  useEffect(() => { if (v && JSON.stringify(v) !== initial) draft.write(v); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const codes = useMemo(() => CODES.filter((c) => c.type === v?.type), [v?.type]);

  if (error || existing.error) return <ErrorBox error={error ?? existing.error} />;
  if (isLoading || !data || (id && existing.isLoading)) return <Loading />;
  if (id && !existing.data) return <ErrorBox error={new Error("Movimento non trovato.")} />;
  if (existing.data?.deleted_at) return <ErrorBox error={new Error("Questo movimento è stato eliminato e non può essere modificato.")} />;
  if (!v) return <Loading />;

  const locked = data.years.find((y) => y.year === year)?.status !== "open";
  const set = (p: Partial<TransactionInput>) => setV((x) => (x ? { ...x, ...p } : x));
  const ret = sp.get("ritorno"); const safeRet = ret && /^\/tesoreria\/quote\/\d{4}\/socio\/[0-9a-f-]{36}$/.test(ret) ? ret : null;
  const back = safeRet ?? (id ? `/tesoreria/movimenti/${id}` : `/tesoreria/movimenti?anno=${year}`);
  const cancel = () => { if (canLeave()) { draft.clear(); setV(null); navigate(back); } };
  const submit = async () => {
    setBusy(true);
    try {
      const newId = await saveTransaction(year, v, id ?? null, file, data.members);
      draft.clear(); setInitial(JSON.stringify(v)); setFile(null);
      await refresh();
      toast.success("Movimento salvato");
      navigate(safeRet ?? `/tesoreria/movimenti/${newId ?? id}`, { replace: true });
    } catch (e) { toast.error(e instanceof Error ? (e.message.includes("[") ? "Controlla i campi del modulo" : e.message) : "Errore"); }
    finally { setBusy(false); }
  };
  const title = id ? "Modifica movimento" : "Nuovo movimento";
  const crumbs = id
    ? [{ label: "Movimenti", to: `/tesoreria/movimenti?anno=${year}` }, { label: `Movimento #${existing.data?.movement_number ?? ""}`.trim(), to: back }, { label: "Modifica" }]
    : [{ label: "Movimenti", to: `/tesoreria/movimenti?anno=${year}` }, { label: "Nuovo" }];

  return (
    <>
      <PageHeader back={back} crumbs={crumbs} title={title} subtitle={`Esercizio ${year}`} />
      {locked ? <ErrorBox error={new Error(`L'esercizio ${year} non è aperto: i movimenti non si possono modificare.`)} /> : (
        <form className="space-y-5 max-w-3xl" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Section title="Dati principali">
            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Data *"><Input className={inp} type="date" required min={`${year}-01-01`} max={`${year}-12-31`} value={v.transaction_date} onChange={(e) => set({ transaction_date: e.target.value })} /></F>
              <F label="Entrata / Uscita *">
                <div className="grid grid-cols-2 border border-input">
                  {(["Entrata", "Uscita"] as const).map((ty) => (
                    <button key={ty} type="button" aria-pressed={v.type === ty} onClick={() => set({ type: ty, excel_code: CODES.find((c) => c.type === ty)!.code })}
                      className={`h-11 text-sm uppercase tracking-widest ${v.type === ty ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{ty}</button>
                  ))}
                </div>
              </F>
              <F label="Importo (€) *" className="sm:col-span-2"><Input className={`${inp} text-lg`} type="number" inputMode="decimal" min="0.01" step="0.01" required value={v.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} /></F>
              <F label="Voce di rendiconto *" className="sm:col-span-2"><select className={selectCls} value={v.excel_code} onChange={(e) => set({ excel_code: e.target.value })}>{codes.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.label}</option>)}</select></F>
            </div>
          </Section>
          <Section title="Pagamento">
            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Modalità *"><select className={selectCls} value={v.payment_method} onChange={(e) => set({ payment_method: e.target.value as TransactionInput["payment_method"] })}>{TEMPLATE_METHODS.map((m) => <option key={m}>{m}</option>)}</select></F>
              <F label="Conto *"><select className={selectCls} value={v.account} onChange={(e) => set({ account: e.target.value as TransactionInput["account"] })}>{TEMPLATE_ACCOUNTS.map((m) => <option key={m}>{m}</option>)}</select></F>
            </div>
          </Section>
          <Section title="Dettagli">
            <F label="Descrizione *"><Input className={inp} required maxLength={500} value={v.description} onChange={(e) => set({ description: e.target.value })} /></F>
            <F label="Soggetto / fornitore"><Input className={inp} maxLength={200} disabled={!!v.member_id && v.excel_code === "A.E.1"} value={v.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} /></F>
            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Evento collegato"><select className={selectCls} value={v.event_id ?? ""} onChange={(e) => set({ event_id: e.target.value || null })}><option value="">—</option>{data.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></F>
              <F label="Socio collegato"><select className={selectCls} value={v.member_id ?? ""} onChange={(e) => { const m = data.members.find((x) => x.id === e.target.value); set({ member_id: m?.id ?? null, ...(m && v.excel_code === "A.E.1" ? { subject: m.full_name } : {}) }); }}><option value="">—</option>{data.members.map((m) => <option key={m.id} value={m.id}>{memberLabel(m)}</option>)}</select></F>
            </div>
            {v.member_id && v.excel_code === "A.E.1" && <p className="text-xs text-muted-foreground">Quota associativa: il soggetto è il nome del socio, come richiesto dal modello del commercialista.</p>}
          </Section>
          <Section title="Documento">
            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Numero documento"><Input className={inp} maxLength={100} value={v.document_number ?? ""} onChange={(e) => set({ document_number: e.target.value })} /></F>
              <F label="Data documento"><Input className={inp} type="date" value={v.document_date ?? ""} onChange={(e) => set({ document_date: e.target.value })} /></F>
            </div>
            <F label={`Giustificativo (PDF, JPG, PNG · max 10 MB)${existing.data?.attachment_path ? " — sostituisce quello attuale" : ""}`}>
              <Input className="h-auto py-2" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </F>
            {existing.data?.attachment_name && !file && <p className="text-xs text-muted-foreground">Attuale: {existing.data.attachment_name}</p>}
          </Section>
          <Section title="Note">
            <Textarea className="text-base md:text-sm min-h-24" maxLength={1000} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </Section>

          <div className="sticky bottom-16 md:bottom-0 z-20 -mx-4 md:mx-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
            <p className="hidden sm:block text-sm text-muted-foreground mr-auto">{v.type} · {euro(v.amount || 0)}</p>
            <Button type="button" variant="outline" className="h-12 flex-1 sm:flex-none" onClick={cancel}>Annulla</Button>
            <Button type="submit" className="h-12 flex-[2] sm:flex-none sm:px-8" disabled={busy}>{busy ? "Salvataggio…" : "Salva movimento"}</Button>
          </div>
        </form>
      )}
    </>
  );
}
