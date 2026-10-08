import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { codeLabel, euro, summary } from "@/lib/treasury";
import { ErrorBox, Kpi, Loading, PageHeader, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const PIE = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--secondary))", "hsl(var(--destructive))", "hsl(var(--foreground))"];
const box = "border border-border bg-card p-4 h-72";

export default function TreasuryDashboard() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const s = summary(data, year);
  const fy = data.years.find((y) => y.year === year);

  const monthly = MONTHS.map((m) => ({ m, Entrate: 0, Uscite: 0 }));
  data.transactions.forEach((t) => { const r = monthly[Number(t.transaction_date.slice(5, 7)) - 1]; r[t.type === "Entrata" ? "Entrate" : "Uscite"] += t.amount; });
  const byCat = Object.entries(data.transactions.filter((t) => t.type === "Uscita").reduce<Record<string, number>>((a, t) => ({ ...a, [t.excel_code]: (a[t.excel_code] ?? 0) + t.amount }), {})).map(([name, value]) => ({ name, value }));
  let cum = 0;
  const duesTrend = MONTHS.map((m, i) => { cum += data.transactions.filter((t) => t.excel_code === "A.E.1" && Number(t.transaction_date.slice(5, 7)) === i + 1).reduce((a, t) => a + t.amount, 0); return { m, Incassato: cum, Previsto: s.duesTotal }; });
  const alerts = [
    s.missingDocs > 0 && { text: `${s.missingDocs} movimenti senza giustificativo`, to: `/tesoreria/documenti?anno=${year}&stato=senza` },
    s.duesOpen > 0 && { text: `Quote da incassare: ${euro(s.duesOpen)}`, to: `/tesoreria/quote/${year}` },
    s.bank < 0 && { text: "Saldo banca negativo", to: `/tesoreria/movimenti?anno=${year}&conto=Banca` },
    s.cash < 0 && { text: "Saldo cassa negativo", to: `/tesoreria/movimenti?anno=${year}&conto=Cassa` },
    data.fees !== null && data.fees.filter((f) => !f.superseded_at).length < 4 && { text: "Quote associative non tutte deliberate", to: `/tesoreria/quote/${year}/impostazioni` },
  ].filter(Boolean) as { text: string; to: string }[];

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard" }]} title="Dashboard" subtitle={`Esercizio ${year}${fy ? ` · ${fy.status === "open" ? "aperto" : "chiuso"}` : ""}`}
        actions={fy?.status === "open" && <Button asChild className="h-11"><Link to={`/tesoreria/movimenti/nuovo?anno=${year}`}><Plus className="h-4 w-4 mr-1" />Nuovo movimento</Link></Button>} />
      {alerts.length > 0 && (
        <ul className="mb-6 border border-destructive/40 bg-destructive/5 divide-y divide-border">
          {alerts.map((a) => <li key={a.text}><Link to={a.to} className="flex items-center gap-2 px-4 min-h-11 py-2 text-sm text-foreground hover:bg-card"><AlertTriangle className="h-4 w-4 text-destructive shrink-0" />{a.text}</Link></li>)}
        </ul>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Entrate" value={euro(s.inc)} /><Kpi label="Uscite" value={euro(s.out)} /><Kpi label="Avanzo / disavanzo" value={euro(s.result)} warn={s.result < 0} /><Kpi label="Movimenti" value={String(s.count)} />
        <Kpi label="Saldo banca" value={euro(s.bank)} warn={s.bank < 0} /><Kpi label="Saldo cassa" value={euro(s.cash)} warn={s.cash < 0} /><Kpi label="Quote incassate" value={euro(s.duesPaid)} /><Kpi label="Scostamento vs budget" value={euro(s.gap)} warn={s.gap < 0} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={box}><p className="text-sm mb-2">Andamento mensile</p><ResponsiveContainer width="100%" height="90%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={11} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={48} /><Tooltip formatter={(v: number) => euro(v)} /><Legend /><Bar dataKey="Entrate" fill="hsl(var(--accent))" /><Bar dataKey="Uscite" fill="hsl(var(--muted-foreground))" /></BarChart></ResponsiveContainer></div>
        <div className={box}><p className="text-sm mb-2">Spese per voce</p>{byCat.length ? <ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={byCat} dataKey="value" nameKey="name" outerRadius={80} label={(e) => e.name}>{byCat.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip formatter={(v: number, n: string) => [euro(v), `${n} ${codeLabel(n)}`]} /></PieChart></ResponsiveContainer> : <p className="text-sm text-muted-foreground">Nessuna spesa registrata.</p>}</div>
        <div className={box}><p className="text-sm mb-2">Budget vs consuntivo</p><ResponsiveContainer width="100%" height="90%"><BarChart data={[{ n: "Entrate", Budget: s.plannedIn, Consuntivo: s.inc }, { n: "Uscite", Budget: s.plannedOut, Consuntivo: s.out }]}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="n" stroke="hsl(var(--muted-foreground))" /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={48} /><Tooltip formatter={(v: number) => euro(v)} /><Legend /><Bar dataKey="Budget" fill="hsl(var(--muted-foreground))" /><Bar dataKey="Consuntivo" fill="hsl(var(--accent))" /></BarChart></ResponsiveContainer></div>
        <div className={box}><p className="text-sm mb-2">Incasso quote soci</p><ResponsiveContainer width="100%" height="90%"><LineChart data={duesTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={11} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={48} /><Tooltip formatter={(v: number) => euro(v)} /><Legend /><Line dataKey="Incassato" stroke="hsl(var(--accent))" strokeWidth={2} /><Line dataKey="Previsto" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} /></LineChart></ResponsiveContainer></div>
      </div>
    </>
  );
}
