import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Lock, Plus, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { ensureYear, euro, loadYearTotals, setYearStatus } from "@/lib/treasury";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, StatusBadge, defaultYear, fmtDateTime, useRefreshTreasury, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

const useTotals = () => useQuery({ queryKey: ["treasury", "totals"], queryFn: loadYearTotals });

export function Years() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const totals = useTotals();
  const navigate = useNavigate();
  const refresh = useRefreshTreasury();
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const years = [...data.years].sort((a, b) => b.year - a.year);
  const next = Math.max(defaultYear() - 1, ...years.map((y) => y.year)) + 1;
  const create = () => ensureYear(next).then(refresh).then(() => { toast.success(`Esercizio ${next} aperto`); navigate(`/tesoreria/esercizi/${next}`); }).catch((e) => toast.error(e.message));
  return (
    <>
      <PageHeader crumbs={[{ label: "Esercizi" }]} title="Esercizi" subtitle="Esercizi contabili aperti e chiusi" actions={<Button className="h-11" onClick={create}><Plus className="h-4 w-4 mr-1" />Apri esercizio {next}</Button>} />
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {years.length === 0 && <li className="border border-border bg-card p-6 text-muted-foreground">Nessun esercizio.</li>}
        {years.map((y) => { const t = totals.data?.get(y.year); return (
          <li key={y.year}><Link to={`/tesoreria/esercizi/${y.year}`} className="block border border-border bg-card p-5 hover:bg-muted/40">
            <div className="flex items-center justify-between"><span className="font-headline text-4xl">{y.year}</span><StatusBadge status={y.status} label={y.status === "open" ? "Aperto" : "Chiuso"} /></div>
            <dl className="grid grid-cols-2 gap-1 text-sm mt-3">
              <dt className="text-muted-foreground">Movimenti</dt><dd className="text-right">{t?.count ?? 0}</dd>
              <dt className="text-muted-foreground">Entrate</dt><dd className="text-right">{euro(t?.inc ?? 0)}</dd>
              <dt className="text-muted-foreground">Uscite</dt><dd className="text-right">{euro(t?.out ?? 0)}</dd>
            </dl>
            <p className="flex items-center justify-end text-xs uppercase tracking-widest mt-3 text-muted-foreground">Apri esercizio<ChevronRight className="h-4 w-4" /></p>
          </Link></li>
        ); })}
      </ul>
    </>
  );
}

export function YearDetail() {
  const { anno } = useParams();
  const year = Number(anno);
  const { isTreasurer } = useAuth();
  const { data, error, isLoading } = useTreasuryData(year);
  const totals = useTotals();
  const refresh = useRefreshTreasury();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  if (!Number.isInteger(year)) return <ErrorBox error={new Error("Esercizio non valido.")} />;
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const fy = data.years.find((y) => y.year === year);
  const t = totals.data?.get(year);
  const header = <PageHeader back="/tesoreria/esercizi" crumbs={[{ label: "Esercizi", to: "/tesoreria/esercizi" }, { label: String(year) }]} title={`Esercizio ${year}`}
    subtitle={fy ? <StatusBadge status={fy.status} label={fy.status === "open" ? "Aperto" : "Chiuso"} /> : "Non ancora aperto"}
    actions={fy && isTreasurer && <Button variant="outline" className="h-11" onClick={() => setConfirm(true)}>{fy.status === "open" ? <><Lock className="h-4 w-4 mr-1" />Chiudi esercizio</> : <><Unlock className="h-4 w-4 mr-1" />Riapri esercizio</>}</Button>} />;
  if (!fy) return <>{header}<Panel><p className="text-sm text-muted-foreground mb-3">L’esercizio {year} non è ancora stato aperto.</p>
    <Button className="h-11" onClick={() => ensureYear(year).then(refresh).then(() => toast.success(`Esercizio ${year} aperto`)).catch((e) => toast.error(e.message))}>Apri esercizio {year}</Button></Panel></>;
  const toggle = async () => {
    try { await setYearStatus(year, fy.status === "open" ? "closed" : "open"); await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["treasury-audit"] })]); toast.success(fy.status === "open" ? "Esercizio chiuso" : "Esercizio riaperto"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita"); }
  };
  return (
    <>
      {header}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Movimenti" value={String(t?.count ?? data.transactions.length)} /><Kpi label="Entrate" value={euro(t?.inc ?? 0)} /><Kpi label="Uscite" value={euro(t?.out ?? 0)} /><Kpi label="Risultato" value={euro((t?.inc ?? 0) - (t?.out ?? 0))} warn={(t?.inc ?? 0) < (t?.out ?? 0)} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Stato">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Apertura</dt><dd>{fmtDateTime(fy.created_at)}</dd>
            <dt className="text-muted-foreground">Chiusura</dt><dd>{fy.status === "closed" ? fmtDateTime(fy.closed_at) : "—"}</dd>
          </dl>
          <p className="text-xs text-muted-foreground mt-3">{fy.status === "closed" ? "Movimenti, quote e budget sono bloccati: si possono consultare ed esportare." : "Solo il Tesoriere può chiudere o riaprire l’esercizio. Ogni operazione resta nell’audit log."}</p>
        </Panel>
        <Panel title="Collegamenti">
          <div className="grid gap-2">
            <Button asChild variant="outline" className="h-11 justify-start"><Link to={`/tesoreria/rendiconto/${year}`}>Rendiconto {year}</Link></Button>
            <Button asChild variant="outline" className="h-11 justify-start"><Link to={`/tesoreria/movimenti?anno=${year}`}>Movimenti {year}</Link></Button>
            <Button asChild variant="outline" className="h-11 justify-start"><Link to="/tesoreria/audit?tabella=treasury_fiscal_years">Audit esercizi</Link></Button>
          </div>
        </Panel>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fy.status === "open" ? `Chiudere l’esercizio ${year}?` : `Riaprire l’esercizio ${year}?`}</AlertDialogTitle>
            <AlertDialogDescription>{fy.status === "open" ? "Non sarà più possibile modificare movimenti, quote e budget. Resta possibile consultare ed esportare." : "Movimenti, quote e budget torneranno modificabili. La riapertura viene registrata nell’audit log."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={toggle}>{fy.status === "open" ? "Chiudi esercizio" : "Riapri esercizio"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
