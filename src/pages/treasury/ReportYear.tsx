import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CODES, euro, exportReport, summary } from "@/lib/treasury";
import { exportReportPdf } from "@/lib/treasury-pdf";
import { TEMPLATE_LIMITS } from "@/lib/treasury-template-lists";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

export default function ReportYear() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const [exporting, setExporting] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const s = summary(data, year);
  const fy = data.years.find((y) => y.year === year);
  const actual = (c: string) => data.transactions.filter((t) => t.excel_code === c).reduce((a, t) => a + t.amount, 0);
  const members = data.members.filter((m) => m.active).length;
  const alerts = [
    fy?.status !== "closed" && "Esercizio aperto: i dati sono provvisori.",
    s.missingDocs > 0 && `${s.missingDocs} movimenti senza giustificativo.`,
    s.result < 0 && "Risultato d’esercizio negativo (disavanzo).",
    s.duesOpen > 0 && `Quote ancora da incassare: ${euro(s.duesOpen)}.`,
    (data.transactions.length > TEMPLATE_LIMITS.movements || members > TEMPLATE_LIMITS.members) && `Il modello Excel accetta fino a ${TEMPLATE_LIMITS.movements} movimenti e ${TEMPLATE_LIMITS.members} soci: l’export Excel sarà bloccato, i dati restano integri.`,
  ].filter(Boolean) as string[];

  const doExcel = async () => {
    setExporting(true);
    try { toast.success(`Rendiconto generato: ${await exportReport(data, year)}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export non riuscito", { duration: 12000 }); }
    finally { setExporting(false); }
  };
  const doPdf = () => { try { toast.success(`PDF generato: ${exportReportPdf(data, year)}`); } catch (e) { toast.error(e instanceof Error ? e.message : "PDF non generato"); } };

  return (
    <>
      <PageHeader crumbs={[{ label: "Rendiconto", to: "/tesoreria/rendiconto" }, { label: String(year) }]} title="Rendiconto" subtitle={`Esercizio ${year} · ${fy?.status === "closed" ? "chiuso" : "aperto"}`}
        actions={<>
          <Button className="h-11" onClick={doExcel} disabled={exporting}><FileSpreadsheet className="h-4 w-4 mr-1" />{exporting ? "Generazione…" : "Esporta rendiconto Excel"}</Button>
          <Button variant="outline" className="h-11" onClick={doPdf}><FileText className="h-4 w-4 mr-1" />PDF Consiglio</Button>
        </>} />
      {alerts.length > 0 && <ul className="mb-4 border border-destructive/40 bg-destructive/5 divide-y divide-border">{alerts.map((a) => <li key={a} className="flex items-center gap-2 px-4 py-3 text-sm"><AlertTriangle className="h-4 w-4 text-destructive shrink-0" />{a}</li>)}</ul>}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Kpi label="Entrate" value={euro(s.inc)} /><Kpi label="Uscite" value={euro(s.out)} /><Kpi label="Avanzo / disavanzo" value={euro(s.result)} warn={s.result < 0} />
        <Kpi label="Saldo cassa" value={euro(s.cash)} warn={s.cash < 0} /><Kpi label="Saldo banca" value={euro(s.bank)} warn={s.bank < 0} /><Kpi label="Quote incassate" value={`${euro(s.duesPaid)} / ${euro(s.duesTotal)}`} />
        <Kpi label="Budget: avanzo previsto" value={euro(s.plannedResult)} /><Kpi label="Scostamento vs budget" value={euro(s.gap)} warn={s.gap < 0} /><Kpi label="Movimenti" value={String(s.count)} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {(["Entrata", "Uscita"] as const).map((ty) => {
          const rows = CODES.filter((c) => c.type === ty).map((c) => ({ ...c, v: actual(c.code) })).filter((r) => r.v);
          return (
            <Panel key={ty} title={ty === "Entrata" ? "Entrate per voce" : "Uscite per voce"}>
              <ul className="divide-y divide-border text-sm">
                {rows.length === 0 && <li className="py-2 text-muted-foreground">Nessuna voce.</li>}
                {rows.map((r) => <li key={r.code} className="flex justify-between gap-3 py-2"><Link className="hover:underline" to={`/tesoreria/movimenti?anno=${year}&voce=${r.code}`}><span className="text-muted-foreground">{r.code}</span> {r.label}</Link><span className="whitespace-nowrap">{euro(r.v)}</span></li>)}
                <li className="flex justify-between py-2 font-medium"><span>Totale</span><span>{euro(ty === "Entrata" ? s.inc : s.out)}</span></li>
              </ul>
            </Panel>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-6">L’Excel ufficiale nasce da una copia del modello del commercialista: vengono compilate solo le celle di inserimento e le formule sono verificate identiche prima del download, altrimenti l’export si blocca.</p>
    </>
  );
}
