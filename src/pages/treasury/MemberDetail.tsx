import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { euro, feeFor, loadAudit, memberDues, openReceipt, resolutionLabel } from "@/lib/treasury";
import { AuditList } from "@/components/treasury/AuditList";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, StatusBadge, fmtDate, fmtDateTime, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-right text-foreground">{children}</dd>
    </div>
  );
}

export default function MemberDetail() {
  const year = useTreasuryYear();
  const { id } = useParams();
  const { data, error, isLoading } = useTreasuryData(year);
  const audit = useQuery({ queryKey: ["treasury-audit", "member", id], queryFn: () => loadAudit({ table: "association_members", recordId: id }), retry: false });

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const m = data.members.find((x) => x.id === id);
  if (!m) return <ErrorBox error={new Error("Socio non trovato.")} />;

  const back = `/tesoreria/quote/${year}`;
  const self = `/tesoreria/quote/${year}/socio/${m.id}`;
  const due = memberDues(data, year).find((d) => d.member.id === m.id);
  const fee = feeFor(data, m.category);
  const linked = data.transactions.filter((t) => t.member_id === m.id).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  const payments = linked.filter((t) => t.excel_code === "A.E.1" && t.type === "Entrata");
  const others = linked.filter((t) => !payments.includes(t));
  const open = data.years.find((y) => y.year === year)?.status === "open";
  const canPay = open && !!due && due.residual > 0;
  const payUrl = `/tesoreria/movimenti/nuovo?anno=${year}&socio=${m.id}&ritorno=${encodeURIComponent(self)}`;

  const TxList = ({ rows, empty }: { rows: typeof linked; empty: string }) =>
    rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
      <ul className="divide-y divide-border -mx-1">
        {rows.map((t) => (
          <li key={t.id}>
            <Link to={`/tesoreria/movimenti/${t.id}`} className="flex items-center gap-3 px-1 py-3 min-h-11">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{fmtDate(t.transaction_date)} · {euro(t.amount)}</p>
                <p className="text-xs text-muted-foreground truncate">{t.movement_number ? `N. ${t.movement_number} · ` : ""}{t.excel_code} · {t.payment_method} · {t.account}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader back={back} crumbs={[{ label: "Quote", to: "/tesoreria/quote" }, { label: String(year), to: back }, { label: m.full_name }]}
        title={m.full_name} subtitle={<>{m.category}{m.member_number ? ` · N. ${m.member_number}` : ""} · Esercizio {year}</>}
        actions={<>
          <Button asChild variant="outline" className="h-11"><Link to={`/tesoreria/quote/${year}/soci/${m.id}`}><Pencil className="h-4 w-4 mr-1" />Modifica</Link></Button>
          {canPay && <Button asChild className="h-11 hidden md:inline-flex"><Link to={payUrl}><Wallet className="h-4 w-4 mr-1" />Registra pagamento</Link></Button>}
        </>} />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi label="Dovuta" value={euro(due?.due ?? 0)} />
        <Kpi label="Incassato" value={euro(due?.paid ?? 0)} />
        <Kpi label="Residuo" value={euro(due?.residual ?? 0)} warn={(due?.residual ?? 0) > 0} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 max-w-6xl pb-24 md:pb-0">
        <Panel title="Socio">
          <dl>
            <Row label="Cognome e nome">{m.full_name}</Row>
            <Row label="Categoria">{m.category}</Row>
            <Row label="Numero socio">{m.member_number || "—"}</Row>
            <Row label="Data ammissione">{fmtDate(m.admission_date)}</Row>
            <Row label="Stato pagamento">{due ? <StatusBadge status={due.status} /> : "—"}</Row>
            <Row label="Ultimo pagamento">{due?.last ? `${fmtDate(due.last)}${due.method ? ` · ${due.method}` : ""}` : "—"}</Row>
          </dl>
          <div className="mt-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Note</p>
            <p className="text-sm whitespace-pre-wrap text-foreground">{m.notes || "Nessuna nota."}</p>
          </div>
        </Panel>

        <Panel title={`Quota deliberata ${year}`}>
          {fee ? (
            <dl>
              <Row label="Importo">{fee.exempt ? "Esente" : euro(fee.amount)}</Row>
              <Row label="Delibera">{resolutionLabel(fee) ?? <span className="text-muted-foreground">Estremi non registrati</span>}</Row>
              <Row label="Registrata il">{fmtDateTime(fee.created_at)}</Row>
              {fee.notes && <Row label="Note">{fee.notes}</Row>}
              {fee.document_path && <Row label="Verbale"><button type="button" className="inline-flex items-center gap-1 underline min-h-11" onClick={() => openReceipt(fee.document_path!, fee.document_name ?? "delibera", false)}><FileText className="h-4 w-4" />{fee.document_name ?? "Apri"}</button></Row>}
            </dl>
          ) : <p className="text-sm text-muted-foreground">Nessuna quota deliberata per la categoria {m.category} nel {year}.</p>}
          <Link to={`/tesoreria/quote/${year}/impostazioni`} className="inline-flex items-center mt-3 min-h-11 text-sm underline">Gestisci quote deliberate</Link>
        </Panel>

        <Panel title={`Versamenti quota (${payments.length})`}>
          <TxList rows={payments} empty="Nessun versamento registrato." />
        </Panel>

        <Panel title={`Altri movimenti collegati (${others.length})`}>
          <TxList rows={others} empty="Nessun altro movimento collegato." />
        </Panel>

        <div className="lg:col-span-2">
          <Panel title="Storico modifiche">
            {audit.isLoading ? <Loading /> : audit.error ? <p className="text-sm text-muted-foreground">Storico non disponibile.</p> : <AuditList rows={audit.data?.rows ?? []} />}
          </Panel>
        </div>
      </div>

      {canPay && (
        <div className="md:hidden fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3">
          <Button asChild className="h-12 w-full"><Link to={payUrl}><Wallet className="h-4 w-4 mr-2" />Registra pagamento {euro(due!.residual)}</Link></Button>
        </div>
      )}
    </>
  );
}
