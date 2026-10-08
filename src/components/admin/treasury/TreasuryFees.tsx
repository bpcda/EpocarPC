import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { MEMBER_CATEGORIES, euro, feeFor, openReceipt, resolutionLabel, saveFee, type TreasuryData } from "@/lib/treasury";
import { selectCls } from "./TreasuryMovements";

type Form = { category: (typeof MEMBER_CATEGORIES)[number]; amount: string; exempt: boolean; resolution_number: string; resolution_date: string; notes: string };

export default function TreasuryFees({ data, year, locked, reload }: { data: TreasuryData; year: number; locked: boolean; reload: () => void }) {
  const [edit, setEdit] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);

  if (data.fees === null) return <div className="border border-border bg-card p-4 text-sm text-muted-foreground">Per gestire le quote deliberate dal Consiglio Direttivo esegui <a className="underline" href="/setup/treasury-v2.sql" target="_blank" rel="noreferrer">l’aggiornamento SQL della Tesoreria</a>.</div>;

  const open = (category: Form["category"]) => {
    const f = feeFor(data, category);
    setFile(null);
    setEdit({ category, amount: f ? String(f.amount) : "", exempt: f?.exempt ?? false, resolution_number: f?.resolution_number ?? "", resolution_date: f?.resolution_date ?? "", notes: "" });
  };
  const submit = async () => {
    if (!edit) return; setBusy(true);
    try {
      await saveFee(year, { ...edit, amount: edit.exempt ? 0 : Number(edit.amount.replace(",", ".")) }, file);
      toast.success(`Quota ${edit.category} ${year} registrata`); setEdit(null); reload();
    } catch (e) { toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "Controlla i campi"); } finally { setBusy(false); }
  };
  const view = (path: string, name: string | null) => openReceipt(path, name ?? "delibera", false).catch((e) => toast.error(e.message));

  return (
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-border">
        <div><p className="font-headline text-lg text-foreground">Quote deliberate dal Consiglio Direttivo — {year}</p>
          <p className="text-xs text-muted-foreground">Il tesoriere registra quanto deliberato dal CD. Ogni variazione resta nello storico e non modifica gli altri esercizi.</p></div>
        <Button variant="outline" size="sm" onClick={() => setHistory(!history)}><History className="h-4 w-4 mr-1" />{history ? "Nascondi storico" : "Storico"}</Button>
      </div>
      <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Quota</TableHead><TableHead>Delibera</TableHead><TableHead className="hidden md:table-cell">Registrata il</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
        <TableBody>
          {MEMBER_CATEGORIES.map((c) => { const f = feeFor(data, c); return (
            <TableRow key={c}>
              <TableCell className="font-medium">{c}</TableCell>
              <TableCell className="text-right">{!f ? <span className="text-destructive">Non deliberata</span> : f.exempt ? "Esente" : euro(f.amount)}</TableCell>
              <TableCell className="text-sm">{f ? resolutionLabel(f) ?? <span className="text-muted-foreground">Estremi delibera non indicati</span> : "—"}</TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{f ? new Date(f.created_at).toLocaleDateString("it-IT") : "—"}</TableCell>
              <TableCell><div className="flex">
                {f?.document_path && <Button variant="ghost" size="icon" aria-label="Vedi delibera" onClick={() => view(f.document_path!, f.document_name)}><Eye className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" aria-label={`Registra quota ${c}`} disabled={locked} onClick={() => open(c)}><Pencil className="h-4 w-4" /></Button>
              </div></TableCell>
            </TableRow>); })}
        </TableBody>
      </Table></div>
      {history && <div className="border-t border-border p-4 space-y-1 text-sm">
        {(data.fees ?? []).length === 0 && <p className="text-muted-foreground">Nessuna registrazione.</p>}
        {(data.fees ?? []).map((f) => <p key={f.id} className={f.superseded_at ? "text-muted-foreground line-through" : "text-foreground"}>
          {new Date(f.created_at).toLocaleString("it-IT")} · {f.category}: {f.exempt ? "esente" : euro(f.amount)}{resolutionLabel(f) ? ` · ${resolutionLabel(f)}` : ""}{f.notes ? ` · ${f.notes}` : ""}
        </p>)}
      </div>}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quota {edit?.category} — esercizio {year}</DialogTitle></DialogHeader>
          {edit && <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Categoria</Label><select className={selectCls} value={edit.category} onChange={(e) => open(e.target.value as Form["category"])}>{MEMBER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><Label>Importo (€) *</Label><Input type="number" min="0" step="0.01" disabled={edit.exempt} value={edit.exempt ? "0" : edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.exempt} onChange={(e) => setEdit({ ...edit, exempt: e.target.checked })} /> Categoria esente</label>
            <div><Label>Delibera CD n.</Label><Input maxLength={50} value={edit.resolution_number} onChange={(e) => setEdit({ ...edit, resolution_number: e.target.value })} /></div>
            <div><Label>Data delibera</Label><Input type="date" value={edit.resolution_date} onChange={(e) => setEdit({ ...edit, resolution_date: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Verbale o estratto (PDF/JPG/PNG, facoltativo)</Label><Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="sm:col-span-2"><Label>Note / motivazione</Label><Input maxLength={1000} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">La registrazione precedente non viene cancellata: resta nello storico e nel registro modifiche.</p>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Annulla</Button><Button disabled={busy || (!edit?.exempt && edit?.amount === "")} onClick={submit}>Registra</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
