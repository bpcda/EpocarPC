import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSpreadsheet, Lock, Unlock, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { CODES, codeLabel, ensureYear, euro, exportReport, loadTreasury, openReceipt, saveBudget, setYearStatus, summary, type TreasuryData } from "@/lib/treasury";
import TreasuryMovements, { ReceiptReplace, selectCls } from "./TreasuryMovements";
import TreasuryMembers from "./TreasuryMembers";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const PIE = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--secondary))", "hsl(var(--destructive))", "hsl(var(--foreground))"];

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div className="border border-border bg-card p-4"><p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p><p className={`text-2xl font-headline mt-1 ${warn ? "text-destructive" : "text-foreground"}`}>{value}</p></div>;
}

export default function TreasuryTab() {
  const { isTreasurer } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear() < 2026 ? 2026 : new Date().getFullYear());
  const [data, setData] = useState<TreasuryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(() => {
    loadTreasury(year).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, [year]);
  useEffect(reload, [reload]);

  const fy = data?.years.find((y) => y.year === year);
  const locked = !fy || fy.status === "closed";
  const s = useMemo(() => (data ? summary(data, year) : null), [data, year]);

  if (error) return <div className="border border-border bg-card p-8 space-y-2"><p className="font-medium text-foreground">{error}</p><p className="text-sm text-muted-foreground">Installa <a className="underline" href="/setup/treasury.sql" target="_blank" rel="noreferrer">questo script SQL</a> e poi <a className="underline" href="/setup/treasury-v2.sql" target="_blank" rel="noreferrer">l’aggiornamento</a> sulla tua istanza, poi assegna il ruolo “treasurer” ai tesorieri.</p></div>;
  if (!data || !s) return <p className="text-muted-foreground py-12 text-center">Caricamento tesoreria…</p>;

  const monthly = MONTHS.map((m, i) => ({ m, Entrate: 0, Uscite: 0, i }));
  data.transactions.forEach((t) => { const r = monthly[Number(t.transaction_date.slice(5, 7)) - 1]; r[t.type === "Entrata" ? "Entrate" : "Uscite"] += t.amount; });
  const byCat = Object.entries(data.transactions.filter((t) => t.type === "Uscita").reduce<Record<string, number>>((a, t) => ({ ...a, [t.excel_code]: (a[t.excel_code] ?? 0) + t.amount }), {})).map(([name, value]) => ({ name, value }));
  const actual = (code: string) => data.transactions.filter((t) => t.excel_code === code).reduce((a, t) => a + t.amount, 0);
  const budgetRows = CODES.map((c) => ({ ...c, planned: data.budgets.find((b) => b.excel_code === c.code)?.planned_amount ?? 0, actual: actual(c.code) }));
  let cum = 0;
  const duesTrend = MONTHS.map((m, i) => { cum += data.transactions.filter((t) => t.excel_code === "A.E.1" && Number(t.transaction_date.slice(5, 7)) === i + 1).reduce((a, t) => a + t.amount, 0); return { m, Incassato: cum, Previsto: s.duesTotal }; });

  const doExport = async () => {
    setExporting(true);
    try { const name = await exportReport(data, year); toast.success(`Rendiconto generato: ${name}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export non riuscito", { duration: 12000 }); }
    finally { setExporting(false); }
  };
  const years = [...new Set([...data.years.map((y) => y.year), year])].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-headline font-medium text-foreground mr-auto">Tesoreria</h2>
        <select className={`${selectCls} w-auto`} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Esercizio">
          {years.map((y) => <option key={y} value={y}>Esercizio {y}</option>)}
          {!years.includes(years[years.length - 1] + 1) && <option value={years[years.length - 1] + 1}>+ Esercizio {years[years.length - 1] + 1}</option>}
        </select>
        {!fy && <Button size="sm" onClick={() => ensureYear(year).then(reload).catch((e) => toast.error(e.message))}>Apri esercizio {year}</Button>}
        {fy && <span className="text-xs uppercase tracking-widest border border-border px-2 py-1 text-muted-foreground">{fy.status === "open" ? "Esercizio aperto" : "Esercizio chiuso"}</span>}
        {fy && isTreasurer && <Button size="sm" variant="outline" onClick={() => { if (confirm(fy.status === "open" ? `Chiudere l'esercizio ${year}? Non sarà più possibile modificare i movimenti.` : `Riaprire l'esercizio ${year}?`)) setYearStatus(year, fy.status === "open" ? "closed" : "open").then(reload).catch((e) => toast.error(e.message)); }}>{fy.status === "open" ? <><Lock className="h-4 w-4 mr-1" />Chiudi</> : <><Unlock className="h-4 w-4 mr-1" />Riapri</>}</Button>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Dashboard</TabsTrigger><TabsTrigger value="movements">Movimenti</TabsTrigger><TabsTrigger value="members">Quote soci</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger><TabsTrigger value="report">Rendiconto</TabsTrigger><TabsTrigger value="docs">Documenti</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Entrate" value={euro(s.inc)} /><Kpi label="Uscite" value={euro(s.out)} /><Kpi label="Avanzo / disavanzo" value={euro(s.result)} warn={s.result < 0} /><Kpi label="Movimenti" value={String(s.count)} />
            <Kpi label="Saldo banca" value={euro(s.bank)} warn={s.bank < 0} /><Kpi label="Saldo cassa" value={euro(s.cash)} warn={s.cash < 0} /><Kpi label="Senza giustificativo" value={String(s.missingDocs)} warn={s.missingDocs > 0} /><Kpi label="Quote previste" value={euro(s.duesTotal)} />
            <Kpi label="Quote incassate" value={euro(s.duesPaid)} /><Kpi label="Quote da incassare" value={euro(s.duesOpen)} warn={s.duesOpen > 0} /><Kpi label="Budget (avanzo previsto)" value={euro(s.plannedResult)} /><Kpi label="Scostamento vs budget" value={euro(s.gap)} warn={s.gap < 0} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border border-border bg-card p-4 h-72"><p className="text-sm mb-2 text-foreground">Andamento mensile</p><ResponsiveContainer width="100%" height="90%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} /><Tooltip formatter={(v: number) => euro(v)} /><Legend /><Bar dataKey="Entrate" fill="hsl(var(--accent))" /><Bar dataKey="Uscite" fill="hsl(var(--muted-foreground))" /></BarChart></ResponsiveContainer></div>
            <div className="border border-border bg-card p-4 h-72"><p className="text-sm mb-2 text-foreground">Spese per voce</p>{byCat.length ? <ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={byCat} dataKey="value" nameKey="name" outerRadius={90} label={(e) => e.name}>{byCat.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip formatter={(v: number, n: string) => [euro(v), `${n} ${codeLabel(n)}`]} /></PieChart></ResponsiveContainer> : <p className="text-sm text-muted-foreground">Nessuna spesa registrata.</p>}</div>
            <div className="border border-border bg-card p-4 h-72"><p className="text-sm mb-2 text-foreground">Budget vs consuntivo</p><ResponsiveContainer width="100%" height="90%"><BarChart data={[{ n: "Entrate", Budget: s.plannedIn, Consuntivo: s.inc }, { n: "Uscite", Budget: s.plannedOut, Consuntivo: s.out }]}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="n" stroke="hsl(var(--muted-foreground))" /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} /><Tooltip formatter={(v: number) => euro(v)} /><Legend /><Bar dataKey="Budget" fill="hsl(var(--muted-foreground))" /><Bar dataKey="Consuntivo" fill="hsl(var(--accent))" /></BarChart></ResponsiveContainer></div>
            <div className="border border-border bg-card p-4 h-72"><p className="text-sm mb-2 text-foreground">Incasso quote soci</p><ResponsiveContainer width="100%" height="90%"><LineChart data={duesTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={12} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} /><Tooltip formatter={(v: number) => euro(v)} /><Legend /><Line dataKey="Incassato" stroke="hsl(var(--accent))" strokeWidth={2} /><Line dataKey="Previsto" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} /></LineChart></ResponsiveContainer></div>
          </div>
        </TabsContent>

        <TabsContent value="movements"><TreasuryMovements data={data} year={year} locked={locked} reload={reload} presetMember={payFor} onPresetUsed={() => setPayFor(null)} /></TabsContent>
        <TabsContent value="members"><TreasuryMembers data={data} year={year} locked={locked} reload={reload} onPay={(id) => { setPayFor(id); setTab("movements"); }} /></TabsContent>

        <TabsContent value="budget">
          <div className="border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Voce</TableHead><TableHead className="min-w-[14rem]">Descrizione</TableHead><TableHead className="text-right w-40">Preventivo</TableHead><TableHead className="text-right">Consuntivo</TableHead><TableHead className="text-right">Scostamento</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
              <TableBody>
                {budgetRows.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="whitespace-nowrap">{r.code}</TableCell><TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell className="text-right"><Input key={`${year}-${r.code}-${r.planned}`} type="number" min="0" step="0.01" disabled={locked} defaultValue={r.planned || ""} className="h-8 text-right"
                      onBlur={(e) => { const v = Number(e.target.value || 0); if (v !== r.planned) saveBudget(year, r.code, v, r.label).then(() => { toast.success(`Budget ${r.code} salvato`); reload(); }).catch((er) => toast.error(er.message)); }} /></TableCell>
                    <TableCell className="text-right">{euro(r.actual)}</TableCell><TableCell className="text-right">{euro(r.actual - r.planned)}</TableCell>
                    <TableCell className="text-right">{r.planned ? `${Math.round(((r.actual - r.planned) / r.planned) * 100)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="report" className="space-y-6">
          <div className="border border-border bg-card p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Il file ufficiale viene creato copiando il modello del commercialista e compilando solo le celle di inserimento (Movimenti, Quote Soci, Preventivo del Budget). Le formule non vengono toccate: prima del download il sistema verifica che siano identiche al modello, altrimenti l’export si blocca.</p>
            <Button size="lg" onClick={doExport} disabled={exporting}><FileSpreadsheet className="h-5 w-5 mr-2" />{exporting ? "Generazione…" : "ESPORTA RENDICONTO EXCEL"}</Button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {(["Entrata", "Uscita"] as const).map((ty) => (
              <div key={ty} className="border border-border bg-card"><Table><TableHeader><TableRow><TableHead colSpan={2}>{ty === "Entrata" ? "Entrate" : "Uscite"} per voce</TableHead><TableHead className="text-right">Importo</TableHead></TableRow></TableHeader>
                <TableBody>{budgetRows.filter((r) => r.type === ty && r.actual).map((r) => <TableRow key={r.code}><TableCell>{r.code}</TableCell><TableCell className="text-sm">{r.label}</TableCell><TableCell className="text-right">{euro(r.actual)}</TableCell></TableRow>)}
                  <TableRow><TableCell colSpan={2} className="font-medium">Totale</TableCell><TableCell className="text-right font-medium">{euro(ty === "Entrata" ? s.inc : s.out)}</TableCell></TableRow></TableBody></Table></div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="docs">
          <div className="border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Movimento</TableHead><TableHead className="text-right">Importo</TableHead><TableHead>Giustificativo</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {data.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString("it-IT")}</TableCell><TableCell>{t.description}</TableCell><TableCell className="text-right">{euro(t.amount)}</TableCell>
                    <TableCell>{t.attachment_path ? <div className="flex items-center gap-1"><span className="text-sm truncate max-w-[10rem]">{t.attachment_name}</span>
                      <Button variant="ghost" size="icon" aria-label="Apri" onClick={() => openReceipt(t.attachment_path!, t.attachment_name ?? "doc", false).catch((e) => toast.error(e.message))}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Scarica" onClick={() => openReceipt(t.attachment_path!, t.attachment_name ?? "doc", true).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /></Button></div> : <span className="text-xs text-destructive">Mancante</span>}</TableCell>
                    <TableCell><ReceiptReplace year={year} tx={t} reload={reload} locked={locked} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
