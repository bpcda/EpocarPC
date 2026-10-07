import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { euro, memberDues, saveMember, type Member, type TreasuryData } from "@/lib/treasury";
import { TEMPLATE_MEMBER_CATEGORIES } from "@/lib/treasury-template-lists";
import { selectCls } from "./TreasuryMovements";

type Form = { full_name: string; member_number: string; category: "Fondatore" | "Ordinario" | "Sostenitore" | "Onorario"; admission_date: string; notes: string };

export default function TreasuryMembers({ data, year, locked, reload, onPay }: { data: TreasuryData; year: number; locked: boolean; reload: () => void; onPay: (memberId: string) => void }) {
  const [edit, setEdit] = useState<{ id: string | null; v: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const dues = memberDues(data, year);
  const open = (m?: Member) => setEdit({ id: m?.id ?? null, v: { full_name: m?.full_name ?? "", member_number: m?.member_number ?? "", category: (m?.category as Form["category"]) ?? "Ordinario", admission_date: m?.admission_date ?? "", notes: m?.notes ?? "" } });
  const submit = async () => {
    if (!edit) return; setBusy(true);
    try { await saveMember(edit.v, edit.id); toast.success("Socio salvato"); setEdit(null); reload(); }
    catch (e) { toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "Controlla i campi"); } finally { setBusy(false); }
  };
  const badge: Record<string, string> = { Pagato: "bg-accent/10 text-accent", Esente: "bg-muted text-muted-foreground", "Parzialmente pagato": "bg-secondary text-secondary-foreground", "Da pagare": "bg-destructive/10 text-destructive" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Quote {year} secondo le categorie del modello: {TEMPLATE_MEMBER_CATEGORIES.map((c) => `${c.name} ${euro(c.fee)}`).join(" · ")}. Registrando un pagamento si crea il movimento in entrata (voce A.E.1).</p>
        <Button onClick={() => open()}><Plus className="h-4 w-4 mr-1" />Nuovo socio</Button>
      </div>
      <div className="border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Socio</TableHead><TableHead className="hidden sm:table-cell">N.</TableHead><TableHead>Categoria</TableHead>
            <TableHead className="text-right">Prevista</TableHead><TableHead className="text-right">Versato</TableHead><TableHead className="text-right">Residuo</TableHead>
            <TableHead className="hidden md:table-cell">Pagamento</TableHead><TableHead>Stato</TableHead><TableHead className="w-28" />
          </TableRow></TableHeader>
          <TableBody>
            {dues.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Nessun socio registrato.</TableCell></TableRow>}
            {dues.map((d) => (
              <TableRow key={d.member.id}>
                <TableCell className="font-medium">{d.member.full_name}</TableCell>
                <TableCell className="hidden sm:table-cell">{d.member.member_number || "—"}</TableCell>
                <TableCell>{d.member.category}</TableCell>
                <TableCell className="text-right">{euro(d.due)}</TableCell>
                <TableCell className="text-right">{euro(d.paid)}</TableCell>
                <TableCell className="text-right">{euro(d.residual)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{d.last ? `${new Date(d.last).toLocaleDateString("it-IT")} · ${d.method}` : "—"}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 whitespace-nowrap ${badge[d.status]}`}>{d.status}</span></TableCell>
                <TableCell><div className="flex">
                  <Button variant="ghost" size="icon" aria-label="Registra pagamento" disabled={locked || d.residual === 0} onClick={() => onPay(d.member.id)}><Wallet className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Modifica socio" onClick={() => open(d.member)}><Pencil className="h-4 w-4" /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica socio" : "Nuovo socio"}</DialogTitle></DialogHeader>
          {edit && <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Cognome e nome *</Label><Input maxLength={120} value={edit.v.full_name} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, full_name: e.target.value } })} /></div>
            <div><Label>Numero socio</Label><Input maxLength={20} value={edit.v.member_number} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, member_number: e.target.value } })} /></div>
            <div><Label>Categoria *</Label><select className={selectCls} value={edit.v.category} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, category: e.target.value as Form["category"] } })}>{TEMPLATE_MEMBER_CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
            <div><Label>Data ammissione</Label><Input type="date" value={edit.v.admission_date} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, admission_date: e.target.value } })} /></div>
            <div className="sm:col-span-2"><Label>Note</Label><Input maxLength={1000} value={edit.v.notes} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, notes: e.target.value } })} /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Annulla</Button><Button disabled={busy} onClick={submit}>Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
