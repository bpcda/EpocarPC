import { useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEMBER_CATEGORIES, euro, feeFor, openReceipt, resolutionLabel, saveFee, type TreasuryData } from "@/lib/treasury";
import { ErrorBox, Loading, PageHeader, Panel, fmtDateTime, useRefreshTreasury, useTreasuryData, useTreasuryYear, useUnsavedGuard } from "@/components/treasury/shared";

type Cat = (typeof MEMBER_CATEGORIES)[number];
type Form = { amount: string; exempt: boolean; resolution_number: string; resolution_date: string; notes: string };
const inp = "h-11 text-base md:text-sm";

function CategoryCard({ data, year, category, locked, onDirty }: { data: TreasuryData; year: number; category: Cat; locked: boolean; onDirty: (c: Cat, d: boolean) => void }) {
  const f = feeFor(data, category);
  const base: Form = { amount: f ? String(f.amount) : "", exempt: f?.exempt ?? false, resolution_number: f?.resolution_number ?? "", resolution_date: f?.resolution_date ?? "", notes: "" };
  const [v, setV] = useState(base);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshTreasury();
  const set = (p: Partial<Form>) => { const n = { ...v, ...p }; setV(n); onDirty(category, JSON.stringify(n) !== JSON.stringify(base) || !!file); };
  const submit = async () => {
    setBusy(true);
    try {
      await saveFee(year, { category, ...v, amount: v.exempt ? 0 : Number(v.amount.replace(",", ".")) }, file);
      onDirty(category, false); setFile(null); await refresh();
      toast.success(`Quota ${category} ${year} registrata`);
    } catch (e) { toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "Controlla i campi"); } finally { setBusy(false); }
  };
  return (
    <Panel title={category} actions={<span className="text-sm text-foreground">{!f ? <span className="text-destructive">Non deliberata</span> : f.exempt ? "Esente" : euro(f.amount)}</span>}>
      {f && <p className="text-xs text-muted-foreground mb-3">{resolutionLabel(f) ?? "Estremi delibera non indicati"} · registrata il {fmtDateTime(f.created_at)}
        {f.document_path && <Button variant="link" className="h-auto p-0 ml-2 text-xs" onClick={() => openReceipt(f.document_path!, f.document_name ?? "delibera", false).catch((e) => toast.error(e.message))}><Eye className="h-3 w-3 mr-1" />Delibera</Button>}</p>}
      <form className="grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <fieldset disabled={locked || busy} className="contents">
          <div className="space-y-1.5"><Label>Importo (€) *</Label><Input className={inp} type="number" inputMode="decimal" min="0" step="0.01" disabled={v.exempt} value={v.exempt ? "0" : v.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
          <label className="flex items-center gap-3 min-h-11 text-sm sm:pt-6"><input type="checkbox" className="h-5 w-5" checked={v.exempt} onChange={(e) => set({ exempt: e.target.checked })} />Categoria esente</label>
          <div className="space-y-1.5"><Label>Delibera CD n.</Label><Input className={inp} maxLength={50} value={v.resolution_number} onChange={(e) => set({ resolution_number: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Data delibera</Label><Input className={inp} type="date" value={v.resolution_date} onChange={(e) => set({ resolution_date: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Verbale o estratto (PDF/JPG/PNG, facoltativo)</Label><Input className="h-auto py-2" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { setFile(e.target.files?.[0] ?? null); onDirty(category, true); }} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Note / motivazione</Label><Input className={inp} maxLength={1000} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
          <Button type="submit" className="h-11 sm:col-span-2 sm:justify-self-end sm:px-8" disabled={!v.exempt && v.amount === ""}>{busy ? "Registrazione…" : `Registra quota ${category}`}</Button>
        </fieldset>
      </form>
    </Panel>
  );
}

export default function FeeSettings() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  useUnsavedGuard(Object.values(dirty).some(Boolean));
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const back = `/tesoreria/quote/${year}`;
  const locked = data.years.find((y) => y.year === year)?.status !== "open";
  const header = <PageHeader back={back} crumbs={[{ label: "Quote", to: "/tesoreria/quote" }, { label: String(year), to: back }, { label: "Impostazioni" }]} title="Quote deliberate" subtitle={`Esercizio ${year} · il Tesoriere registra quanto deliberato dal Consiglio Direttivo`} />;
  if (data.fees === null) return <>{header}<ErrorBox error={new Error("Per le quote deliberate esegui l’aggiornamento SQL della Tesoreria (treasury-v2.sql).")} /></>;
  return (
    <>
      {header}
      {locked && <p className="mb-4 border border-border bg-card p-3 text-sm text-muted-foreground">Esercizio non aperto: le quote sono in sola lettura.</p>}
      <div className="grid lg:grid-cols-2 gap-4">
        {MEMBER_CATEGORIES.map((c) => <CategoryCard key={`${c}-${feeFor(data, c)?.id ?? "none"}`} data={data} year={year} category={c} locked={locked} onDirty={(k, d) => setDirty((x) => ({ ...x, [k]: d }))} />)}
      </div>
      <div className="mt-6"><Panel title="Storico registrazioni">
        {(data.fees ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nessuna registrazione.</p> : (
          <ul className="space-y-1 text-sm">{data.fees.map((f) => <li key={f.id} className={f.superseded_at ? "text-muted-foreground line-through" : "text-foreground"}>
            {fmtDateTime(f.created_at)} · {f.category}: {f.exempt ? "esente" : euro(f.amount)}{resolutionLabel(f) ? ` · ${resolutionLabel(f)}` : ""}{f.notes ? ` · ${f.notes}` : ""}
          </li>)}</ul>
        )}
        <p className="text-xs text-muted-foreground mt-3">Le registrazioni precedenti non vengono mai cancellate e non modificano gli altri esercizi.</p>
      </Panel></div>
    </>
  );
}
