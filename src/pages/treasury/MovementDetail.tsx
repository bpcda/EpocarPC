import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { codeLabel, euro, loadAudit, memberLabel, loadTransaction, openReceipt, softDeleteTransaction } from "@/lib/treasury";
import { AuditList } from "@/components/treasury/AuditList";
import { ErrorBox, Loading, PageHeader, Panel, StatusBadge, fmtDate, fmtDateTime, useRefreshTreasury, useTreasuryData } from "@/components/treasury/shared";

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid grid-cols-[8rem_1fr] sm:grid-cols-[11rem_1fr] gap-2 py-2 border-b border-border last:border-0 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-foreground break-words">{children}</dd></div>
);

export default function MovementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshTreasury();
  const tx = useQuery({ queryKey: ["treasury-tx", id], queryFn: () => loadTransaction(id!) });
  const audit = useQuery({ queryKey: ["treasury-audit", "tx", id], queryFn: () => loadAudit({ table: "treasury_transactions", recordId: id }) });
  const t = tx.data;
  const { data } = useTreasuryData(t?.fiscal_year ?? 0);
  const [del, setDel] = useState(false);

  if (tx.error) return <ErrorBox error={tx.error} />;
  if (tx.isLoading) return <Loading />;
  if (!t) return <ErrorBox error={new Error("Movimento non trovato o non accessibile.")} />;

  const listHref = `/tesoreria/movimenti?anno=${t.fiscal_year}`;
  const open = !t.deleted_at && data?.years.find((y) => y.year === t.fiscal_year)?.status === "open";
  const label = `Movimento #${t.movement_number ?? t.id.slice(0, 6)}`;
  const run = (download: boolean) => openReceipt(t.attachment_path!, t.attachment_name ?? "documento", download).catch((e) => toast.error(e.message));
  const doDelete = async () => {
    try {
      await softDeleteTransaction(t.id);
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["treasury-tx", id] }), qc.invalidateQueries({ queryKey: ["treasury-audit"] })]);
      toast.success("Movimento eliminato: resta nello storico modifiche");
      navigate(listHref, { replace: true });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Eliminazione non riuscita"); }
  };
  const event = data?.events.find((e) => e.id === t.event_id);
  const member = data?.members.find((m) => m.id === t.member_id);

  return (
    <>
      <PageHeader back={listHref} crumbs={[{ label: "Movimenti", to: listHref }, { label }]} title={t.description} subtitle={<>{label} · Esercizio {t.fiscal_year}</>}
        actions={open && <>
          <Button asChild className="h-11"><Link to={`/tesoreria/movimenti/${t.id}/modifica`}><Pencil className="h-4 w-4 mr-1" />Modifica</Link></Button>
          <Button variant="outline" className="h-11" onClick={() => setDel(true)}><Trash2 className="h-4 w-4 mr-1" />Elimina</Button>
        </>} />
      {t.deleted_at && <p className="mb-4 border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground">Movimento eliminato il {fmtDateTime(t.deleted_at)}: escluso da conti e rendiconto, conservato nello storico.</p>}

      <div className="grid lg:grid-cols-[1fr_22rem] gap-4">
        <div className="space-y-4">
          <Panel title="Dati">
            <p className="font-headline text-4xl text-foreground mb-3">{t.type === "Uscita" ? "−" : "+"}{euro(t.amount)}</p>
            <dl>
              <Row k="Tipo"><StatusBadge status={t.type} /></Row>
              <Row k="Data">{fmtDate(t.transaction_date)}</Row>
              <Row k="Voce">{t.excel_code} – {codeLabel(t.excel_code)}</Row>
              <Row k="Soggetto">{t.subject || "—"}</Row>
              <Row k="Modalità">{t.payment_method}</Row>
              <Row k="Conto">{t.account}</Row>
              <Row k="Evento">{event?.title ?? "—"}</Row>
              <Row k="Socio">{member ? <Link className="underline" to={`/tesoreria/quote/${t.fiscal_year}/soci/${member.id}`}>{memberLabel(member)}</Link> : "—"}</Row>
              <Row k="Documento">{[t.document_number, t.document_date && `del ${fmtDate(t.document_date)}`].filter(Boolean).join(" ") || "—"}</Row>
              <Row k="Note">{t.notes || "—"}</Row>
            </dl>
          </Panel>
          <Panel title="Cronologia modifiche">
            {audit.error ? <p className="text-sm text-muted-foreground">Storico non disponibile.</p> : audit.isLoading ? <Loading /> : <AuditList rows={audit.data?.rows ?? []} />}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Giustificativo">
            {t.attachment_path ? (
              <div className="space-y-3">
                <p className="text-sm break-words">{t.attachment_name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" onClick={() => run(false)}><Eye className="h-4 w-4 mr-1" />Visualizza</Button>
                  <Button variant="outline" className="h-11" onClick={() => run(true)}><Download className="h-4 w-4 mr-1" />Scarica</Button>
                </div>
                <Link className="text-sm underline" to={`/tesoreria/documenti/${t.id}`}>Apri scheda documento</Link>
              </div>
            ) : <p className="text-sm text-destructive">Giustificativo mancante.{open && <> <Link className="underline text-foreground" to={`/tesoreria/documenti/${t.id}`}>Caricalo</Link></>}</p>}
          </Panel>
          <Panel title="Registrazione">
            <dl>
              <Row k="Creato il">{fmtDateTime(t.created_at)}</Row>
              <Row k="Creato da">{t.created_by === user?.id ? "Tu" : `Utente ${t.created_by.slice(0, 8)}`}</Row>
              <Row k="Ultima modifica">{fmtDateTime(t.updated_at)}</Row>
            </dl>
          </Panel>
        </div>
      </div>

      <AlertDialog open={del} onOpenChange={setDel}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminare questo movimento?</AlertDialogTitle>
            <AlertDialogDescription>{t.description} · {euro(t.amount)}. Verrà escluso da conti e rendiconto, ma resterà nello storico modifiche.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={doDelete}>Sì, elimina</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
