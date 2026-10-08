import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideApplication, type Submission } from "@/lib/association";

const sel = "h-10 w-full border border-input bg-background px-3 text-sm";

/** Board (CD) decision on a membership application. Approval assigns the card number on the server. */
export function ApplicationDecision({ app, onDone }: { app: Submission; onDone: () => void }) {
  const [mode, setMode] = useState<"approved" | "rejected" | null>(null);
  const [category, setCategory] = useState<"Ordinario" | "Sostenitore" | "Fondatore" | "Onorario">("Ordinario");
  const today = new Date().toISOString().slice(0, 10);
  const [admission, setAdmission] = useState(today);
  const [resDate, setResDate] = useState(today);
  const [resRef, setResRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (app.status === "approved" || app.status === "rejected") {
    return <p className="text-xs text-muted-foreground">Delibera {app.resolution_ref ? `n. ${app.resolution_ref} ` : ""}del {app.resolution_date ? new Date(app.resolution_date).toLocaleDateString("it-IT") : "—"}{app.decision_notes ? ` · ${app.decision_notes}` : ""}</p>;
  }
  if (app.status === "draft") return <p className="text-xs text-muted-foreground">Bozza non ancora inviata dal richiedente.</p>;

  const run = async (decision: "review" | "approved" | "rejected") => {
    if (decision === "approved" && !window.confirm(`Confermi l'ammissione di ${app.full_name} come socio ${category}? Verrà assegnato il numero tessera progressivo e l'operazione non è reversibile.`)) return;
    setBusy(true);
    try {
      await decideApplication(app.id, { decision, category: decision === "approved" ? category : undefined, admission_date: admission, resolution_ref: resRef, resolution_date: resDate, notes });
      toast.success(decision === "approved" ? "Socio ammesso: tessera assegnata" : decision === "rejected" ? "Domanda respinta" : "Domanda in valutazione");
      setMode(null); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita"); } finally { setBusy(false); }
  };

  if (!mode) return (
    <div className="flex flex-wrap gap-2">
      {app.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => run("review")}>In valutazione</Button>}
      <Button size="sm" onClick={() => setMode("approved")}>Approva</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("rejected")}>Respingi</Button>
    </div>
  );

  return (
    <form className="grid sm:grid-cols-2 gap-3 border border-border p-3 min-w-[280px]" onSubmit={(e) => { e.preventDefault(); run(mode); }}>
      <p className="sm:col-span-2 text-sm font-medium">{mode === "approved" ? "Delibera di ammissione del Consiglio Direttivo" : "Delibera di rigetto del Consiglio Direttivo"}</p>
      <div className="space-y-1"><Label>Data delibera *</Label><Input type="date" required value={resDate} onChange={(e) => setResDate(e.target.value)} /></div>
      <div className="space-y-1"><Label>Numero / riferimento verbale</Label><Input maxLength={80} value={resRef} onChange={(e) => setResRef(e.target.value)} /></div>
      {mode === "approved" && <>
        <div className="space-y-1"><Label>Categoria deliberata *</Label><select className={sel} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{["Ordinario", "Sostenitore", "Fondatore", "Onorario"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="space-y-1"><Label>Data di ammissione *</Label><Input type="date" required value={admission} onChange={(e) => setAdmission(e.target.value)} /></div>
      </>}
      <div className="space-y-1 sm:col-span-2"><Label>Note</Label><Textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="sm:col-span-2 flex gap-2 justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => setMode(null)}>Annulla</Button>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Salvataggio…" : mode === "approved" ? "Registra ammissione" : "Registra rigetto"}</Button>
      </div>
    </form>
  );
}
