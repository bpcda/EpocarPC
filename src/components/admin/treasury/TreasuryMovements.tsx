import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Eye, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CODES, codeLabel, euro, openReceipt, saveTransaction, softDeleteTransaction, attachReceipt, type Transaction, type TreasuryData, type TransactionInput } from "@/lib/treasury";
import { TEMPLATE_ACCOUNTS, TEMPLATE_METHODS } from "@/lib/treasury-template-lists";

export const selectCls = "h-10 w-full border border-input bg-background px-3 text-sm text-foreground [&>option]:bg-background [&>option]:text-foreground";

type Props = { data: TreasuryData; year: number; locked: boolean; reload: () => void; presetMember?: string | null; onPresetUsed?: () => void };

const empty = (year: number): TransactionInput => ({
  transaction_date: `${year}-${new Date().toISOString().slice(5, 10)}`, type: "Uscita", excel_code: "A.U.2", description: "", subject: "",
  amount: 0, payment_method: "Bonifico", account: "Banca", event_id: null, member_id: null, document_number: "", document_date: "", notes: "",
});

export default function TreasuryMovements({ data, year, locked, reload, presetMember, onPresetUsed }: Props) {
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [code, setCode] = useState(""); const [account, setAccount] = useState(""); const [doc, setDoc] = useState("");
  const [sort, setSort] = useState<{ k: keyof Transaction; asc: boolean }>({ k: "transaction_date", asc: false });
  const [edit, setEdit] = useState<{ id: string | null; v: TransactionInput } | null>(null);
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [del, setDel] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!presetMember) return;
    const m = data.members.find((x) => x.id === presetMember);
    const due = m ? Math.max(0, ({ Fondatore: 100, Ordinario: 50, Sostenitore: 250, Onorario: 0 } as Record<string, number>)[m.category] ?? 0) : 0;
    setFile(null);
    setEdit({ id: null, v: { ...empty(year), type: "Entrata", excel_code: "A.E.1", member_id: presetMember, subject: m?.full_name ?? "", amount: due, description: `Quota associativa ${year}` } });
    onPresetUsed?.();
  }, [presetMember]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.transactions.filter((t) =>
      (!s || [t.description, t.subject, t.document_number, t.notes, t.excel_code].some((x) => x?.toLowerCase().includes(s))) &&
      (!type || t.type === type) && (!code || t.excel_code === code) && (!account || t.account === account) &&
      (!doc || (doc === "with" ? !!t.attachment_path : !t.attachment_path)),
    ).sort((a, b) => { const x = a[sort.k] ?? "", y = b[sort.k] ?? ""; return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1); });
  }, [data.transactions, q, type, code, account, doc, sort]);

  const th = (k: keyof Transaction, label: string, cls = "") => (
    <TableHead className={`cursor-pointer select-none ${cls}`} onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : true }))}>{label}{sort.k === k ? (sort.asc ? " ↑" : " ↓") : ""}</TableHead>
  );

  const submit = async () => {
    if (!edit) return; setBusy(true);
    try { await saveTransaction(year, edit.v, edit.id, file, data.members); toast.success("Movimento salvato"); setEdit(null); setFile(null); reload(); }
    catch (e) { toast.error(e instanceof Error ? (e.message.includes("[") ? "Controlla i campi del modulo" : e.message) : "Errore"); }
    finally { setBusy(false); }
  };
  const set = (p: Partial<TransactionInput>) => setEdit((e) => (e ? { ...e, v: { ...e.v, ...p } } : e));
  const codes = CODES.filter((c) => c.type === edit?.v.type);
  const run = (f: () => Promise<unknown>) => f().catch((e) => toast.error(e.message));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <Input placeholder="Cerca descrizione, soggetto, documento…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className={`${selectCls} w-auto`} value={type} onChange={(e) => setType(e.target.value)}><option value="">Entrate e uscite</option><option>Entrata</option><option>Uscita</option></select>
        <select className={`${selectCls} w-auto max-w-[14rem]`} value={code} onChange={(e) => setCode(e.target.value)}><option value="">Tutte le voci</option>{CODES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.label}</option>)}</select>
        <select className={`${selectCls} w-auto`} value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Tutti i conti</option>{TEMPLATE_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
        <select className={`${selectCls} w-auto`} value={doc} onChange={(e) => setDoc(e.target.value)}><option value="">Con/senza giustificativo</option><option value="with">Con giustificativo</option><option value="without">Senza giustificativo</option></select>
        <Button className="ml-auto" disabled={locked} onClick={() => { setFile(null); setEdit({ id: null, v: empty(year) }); }}><Plus className="h-4 w-4 mr-1" />Nuovo movimento</Button>
      </div>

      <div className="border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            {th("transaction_date", "Data")}{th("type", "Tipo")}{th("excel_code", "Voce")}{th("description", "Descrizione", "min-w-[12rem]")}
            {th("subject", "Soggetto", "hidden md:table-cell")}{th("account", "Conto", "hidden lg:table-cell")}{th("amount", "Importo", "text-right")}
            <TableHead>Doc.</TableHead><TableHead className="w-24" />
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Nessun movimento.</TableCell></TableRow>}
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString("it-IT")}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 ${t.type === "Entrata" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>{t.type}</span></TableCell>
                <TableCell title={codeLabel(t.excel_code)} className="whitespace-nowrap">{t.excel_code}</TableCell>
                <TableCell>{t.description}<div className="text-xs text-muted-foreground">{t.payment_method}{t.document_number ? ` · Doc. ${t.document_number}` : ""}</div></TableCell>
                <TableCell className="hidden md:table-cell">{t.subject || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{t.account}</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{t.type === "Uscita" ? "−" : ""}{euro(t.amount)}</TableCell>
                <TableCell>
                  {t.attachment_path ? (
                    <div className="flex">
                      <Button variant="ghost" size="icon" aria-label="Apri giustificativo" onClick={() => run(() => openReceipt(t.attachment_path!, t.attachment_name ?? "documento", false))}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Scarica giustificativo" onClick={() => run(() => openReceipt(t.attachment_path!, t.attachment_name ?? "documento", true))}><Download className="h-4 w-4" /></Button>
                    </div>
                  ) : <span className="text-xs text-destructive">Manca</span>}
                </TableCell>
                <TableCell>
                  {!locked && <div className="flex">
                    <Button variant="ghost" size="icon" aria-label="Modifica" onClick={() => { setFile(null); setEdit({ id: t.id, v: { ...t, subject: t.subject ?? "", document_number: t.document_number ?? "", document_date: t.document_date ?? "", notes: t.notes ?? "" } as TransactionInput }); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Elimina" onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></Button>
                  </div>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica movimento" : "Nuovo movimento"}</DialogTitle></DialogHeader>
          {edit && <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Data *</Label><Input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={edit.v.transaction_date} onChange={(e) => set({ transaction_date: e.target.value })} /></div>
            <div><Label>Tipo *</Label><select className={selectCls} value={edit.v.type} onChange={(e) => { const ty = e.target.value as "Entrata" | "Uscita"; set({ type: ty, excel_code: CODES.find((c) => c.type === ty)!.code }); }}><option>Entrata</option><option>Uscita</option></select></div>
            <div className="sm:col-span-2"><Label>Voce di rendiconto *</Label><select className={selectCls} value={edit.v.excel_code} onChange={(e) => set({ excel_code: e.target.value })}>{codes.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.label}</option>)}</select></div>
            <div className="sm:col-span-2"><Label>Descrizione *</Label><Input value={edit.v.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} /></div>
            <div><Label>Importo (€) *</Label><Input type="number" min="0.01" step="0.01" value={edit.v.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} /></div>
            <div><Label>Soggetto / fornitore</Label><Input value={edit.v.subject ?? ""} maxLength={200} disabled={!!edit.v.member_id && edit.v.excel_code === "A.E.1"} onChange={(e) => set({ subject: e.target.value })} /></div>
            <div><Label>Modalità *</Label><select className={selectCls} value={edit.v.payment_method} onChange={(e) => set({ payment_method: e.target.value as TransactionInput["payment_method"] })}>{TEMPLATE_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><Label>Conto *</Label><select className={selectCls} value={edit.v.account} onChange={(e) => set({ account: e.target.value as TransactionInput["account"] })}>{TEMPLATE_ACCOUNTS.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><Label>Socio collegato</Label><select className={selectCls} value={edit.v.member_id ?? ""} onChange={(e) => { const m = data.members.find((x) => x.id === e.target.value); set({ member_id: m?.id ?? null, ...(m && edit.v.excel_code === "A.E.1" ? { subject: m.full_name } : {}) }); }}><option value="">—</option>{data.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
            <div><Label>Evento collegato</Label><select className={selectCls} value={edit.v.event_id ?? ""} onChange={(e) => set({ event_id: e.target.value || null })}><option value="">—</option>{data.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></div>
            <div><Label>N. documento</Label><Input value={edit.v.document_number ?? ""} maxLength={100} onChange={(e) => set({ document_number: e.target.value })} /></div>
            <div><Label>Data documento</Label><Input type="date" value={edit.v.document_date ?? ""} onChange={(e) => set({ document_date: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Giustificativo (PDF, JPG, PNG){edit.id && data.transactions.find((t) => t.id === edit.id)?.attachment_path ? " — sostituisce quello attuale" : ""}</Label><Input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="sm:col-span-2"><Label>Note</Label><Textarea value={edit.v.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Annulla</Button><Button disabled={busy} onClick={submit}>{busy ? "Salvataggio…" : "Salva movimento"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminare questo movimento?</AlertDialogTitle>
            <AlertDialogDescription>{del?.description} · {del && euro(del.amount)}. Il movimento verrà rimosso dai conteggi e dal rendiconto, ma resterà registrato nello storico modifiche.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => del && run(async () => { await softDeleteTransaction(del.id); toast.success("Movimento eliminato"); setDel(null); reload(); })}>Sì, elimina</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ReceiptReplace({ year, tx, reload, locked }: { year: number; tx: Transaction; reload: () => void; locked: boolean }) {
  return (
    <label className={`inline-flex items-center gap-1 text-xs underline ${locked ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
      <Paperclip className="h-3 w-3" />{tx.attachment_path ? "Sostituisci" : "Carica"}
      <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachReceipt(year, tx.id, f).then(() => { toast.success("Giustificativo caricato"); reload(); }).catch((er) => toast.error(er.message)); }} />
    </label>
  );
}
