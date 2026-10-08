import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CODES, euro, saveBudget, summary } from "@/lib/treasury";
import { ErrorBox, Kpi, Loading, PageHeader, useQueryState, useRefreshTreasury, useTreasuryData, useTreasuryYear, useUnsavedGuard } from "@/components/treasury/shared";

const pct = (a: number, p: number) => (p ? `${Math.round(((a - p) / p) * 100)}%` : "—");

export default function BudgetYear() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const [sp, set] = useQueryState();
  const editing = sp.get("modifica") === "1";
  const tipo = sp.get("tipo") === "uscite" ? "Uscita" : sp.get("tipo") === "entrate" ? "Entrata" : "";
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshTreasury();
  const rows = useMemo(() => {
    if (!data) return [];
    const actual = (c: string) => data.transactions.filter((t) => t.excel_code === c).reduce((a, t) => a + t.amount, 0);
    return CODES.map((c) => ({ ...c, planned: data.budgets.find((b) => b.excel_code === c.code)?.planned_amount ?? 0, actual: actual(c.code) }));
  }, [data]);
  const changed = Object.entries(draft).filter(([c, v]) => Number(v || 0) !== (rows.find((r) => r.code === c)?.planned ?? 0));
  const canLeave = useUnsavedGuard(editing && changed.length > 0 && !busy);

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const s = summary(data, year);
  const locked = data.years.find((y) => y.year === year)?.status !== "open";
  const shown = rows.filter((r) => (!tipo || r.type === tipo) && (editing || r.planned || r.actual || tipo));
  const val = (code: string, planned: number) => draft[code] ?? (planned ? String(planned) : "");
  const save = async () => {
    setBusy(true);
    try {
      for (const [code, v] of changed) await saveBudget(year, code, Number(v || 0), CODES.find((c) => c.code === code)!.label);
      await refresh(); setDraft({}); set({ modifica: null }, true);
      toast.success(changed.length ? `${changed.length} voci di budget salvate` : "Nessuna modifica");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito"); } finally { setBusy(false); }
  };
  const exit = () => { if (canLeave()) { setDraft({}); set({ modifica: null }, true); } };

  return (
    <>
      <PageHeader crumbs={[{ label: "Budget", to: "/tesoreria/budget" }, { label: String(year) }]} title={editing ? "Modifica preventivo" : "Budget"} subtitle={`Esercizio ${year} · preventivo e consuntivo`}
        actions={!editing && !locked && <Button className="h-11" onClick={() => set({ modifica: "1" }, true)}><Pencil className="h-4 w-4 mr-1" />Modifica preventivo</Button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Entrate previste" value={euro(s.plannedIn)} /><Kpi label="Uscite previste" value={euro(s.plannedOut)} /><Kpi label="Avanzo previsto" value={euro(s.plannedResult)} /><Kpi label="Scostamento" value={euro(s.gap)} warn={s.gap < 0} />
      </div>
      <div className="flex gap-2 mb-4">
        {[["", "Tutte"], ["entrate", "Entrate"], ["uscite", "Uscite"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => set({ tipo: k || null }, true)} className={`h-11 px-4 border text-sm ${(sp.get("tipo") ?? "") === k ? "border-primary bg-card text-foreground" : "border-border text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {!editing && shown.length === 0 && <p className="border border-border bg-card p-6 text-center text-muted-foreground">Nessuna voce con preventivo o consuntivo.</p>}

      <ul className="md:hidden space-y-2">
        {shown.map((r) => (
          <li key={r.code} className="border border-border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground">{r.code} · {r.type}</p>
            <p className="text-sm font-medium text-foreground">{r.label}</p>
            {editing ? (
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Preventivo (€)</span>
                <Input className="h-11 text-base text-right" type="number" inputMode="decimal" min="0" step="0.01" value={val(r.code, r.planned)} onChange={(e) => setDraft({ ...draft, [r.code]: e.target.value })} /></label>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Preventivo</dt><dd className="text-right">{euro(r.planned)}</dd>
                <dt className="text-muted-foreground">Consuntivo</dt><dd className="text-right">{euro(r.actual)}</dd>
                <dt className="text-muted-foreground">Scostamento</dt><dd className="text-right">{euro(r.actual - r.planned)}</dd>
                <dt className="text-muted-foreground">Scostamento %</dt><dd className="text-right">{pct(r.actual, r.planned)}</dd>
              </dl>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden md:block border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Voce</TableHead><TableHead className="min-w-[14rem]">Descrizione</TableHead><TableHead className="text-right w-44">Preventivo</TableHead><TableHead className="text-right">Consuntivo</TableHead><TableHead className="text-right">Scostamento</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="whitespace-nowrap">{r.code}</TableCell><TableCell className="text-sm">{r.label}</TableCell>
                <TableCell className="text-right">{editing ? <Input className="h-9 text-right" type="number" min="0" step="0.01" value={val(r.code, r.planned)} onChange={(e) => setDraft({ ...draft, [r.code]: e.target.value })} /> : euro(r.planned)}</TableCell>
                <TableCell className="text-right">{euro(r.actual)}</TableCell><TableCell className="text-right">{euro(r.actual - r.planned)}</TableCell><TableCell className="text-right">{pct(r.actual, r.planned)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <div className="sticky bottom-16 md:bottom-0 z-20 -mx-4 md:mx-0 mt-4 border-t border-border bg-background/95 px-4 py-3 flex items-center gap-3">
          <p className="hidden sm:block text-sm text-muted-foreground mr-auto">{changed.length} voci modificate</p>
          <Button variant="outline" className="h-12 flex-1 sm:flex-none" onClick={exit}>Annulla</Button>
          <Button className="h-12 flex-[2] sm:flex-none sm:px-8" disabled={busy} onClick={save}>{busy ? "Salvataggio…" : "Salva preventivo"}</Button>
        </div>
      )}
    </>
  );
}
