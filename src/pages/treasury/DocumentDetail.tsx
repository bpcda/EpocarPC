import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachReceipt, euro, loadTransaction, openReceipt, receiptUrl } from "@/lib/treasury";
import { ErrorBox, Loading, PageHeader, Panel, fmtDate, useRefreshTreasury, useTreasuryData } from "@/components/treasury/shared";

/** Document page keyed by its movement: preview, download, and upload/replace while the year is open. */
export default function DocumentDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const refresh = useRefreshTreasury();
  const tx = useQuery({ queryKey: ["treasury-tx", id], queryFn: () => loadTransaction(id!) });
  const t = tx.data;
  const { data } = useTreasuryData(t?.fiscal_year ?? 0);
  const url = useQuery({ queryKey: ["treasury-doc-url", t?.attachment_path], queryFn: () => receiptUrl(t!.attachment_path!), enabled: !!t?.attachment_path, staleTime: 240_000 });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (tx.error) return <ErrorBox error={tx.error} />;
  if (tx.isLoading) return <Loading />;
  if (!t) return <ErrorBox error={new Error("Documento non trovato.")} />;
  const listHref = `/tesoreria/documenti?anno=${t.fiscal_year}`;
  const open = !t.deleted_at && data?.years.find((y) => y.year === t.fiscal_year)?.status === "open";
  const isPdf = t.attachment_name?.toLowerCase().endsWith(".pdf");
  const upload = async () => {
    if (!file) return; setBusy(true);
    try { await attachReceipt(t.fiscal_year, t.id, file); setFile(null); await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["treasury-tx", id] })]); toast.success("Giustificativo caricato"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Caricamento non riuscito"); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader back={listHref} crumbs={[{ label: "Documenti", to: listHref }, { label: t.attachment_name ?? t.description }]} title={t.attachment_name ?? "Giustificativo mancante"}
        subtitle={<>Movimento <Link className="underline" to={`/tesoreria/movimenti/${t.id}`}>{t.description}</Link> · {fmtDate(t.transaction_date)} · {euro(t.amount)}</>} />
      <div className="grid lg:grid-cols-[1fr_20rem] gap-4">
        <Panel title="Anteprima">
          {!t.attachment_path ? <p className="text-sm text-destructive">Nessun giustificativo caricato per questo movimento.</p>
            : url.isLoading ? <Loading /> : url.error || !url.data ? <p className="text-sm text-muted-foreground">Anteprima non disponibile.</p>
            : isPdf ? <iframe title="Anteprima giustificativo" src={url.data} className="w-full h-[70vh] border border-border bg-background" />
            : <img src={url.data} alt={`Giustificativo: ${t.description}`} className="max-w-full max-h-[70vh] mx-auto object-contain" />}
        </Panel>
        <div className="space-y-4">
          {t.attachment_path && <Panel title="Azioni"><div className="grid gap-2">
            <Button variant="outline" className="h-11" onClick={() => openReceipt(t.attachment_path!, t.attachment_name ?? "documento", false).catch((e) => toast.error(e.message))}><ExternalLink className="h-4 w-4 mr-1" />Apri in nuova scheda</Button>
            <Button variant="outline" className="h-11" onClick={() => openReceipt(t.attachment_path!, t.attachment_name ?? "documento", true).catch((e) => toast.error(e.message))}><Download className="h-4 w-4 mr-1" />Scarica</Button>
          </div></Panel>}
          <Panel title="Dati documento">
            <p className="text-sm">{t.document_number ? `N. ${t.document_number}` : "Numero non indicato"}{t.document_date ? ` del ${fmtDate(t.document_date)}` : ""}</p>
          </Panel>
          {open && <Panel title={t.attachment_path ? "Sostituisci" : "Carica"}>
            <div className="space-y-3">
              <Input className="h-auto py-2" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">PDF, JPG o PNG, massimo 10 MB.</p>
              <Button className="h-11 w-full" disabled={!file || busy} onClick={upload}><Upload className="h-4 w-4 mr-1" />{busy ? "Caricamento…" : "Carica giustificativo"}</Button>
            </div>
          </Panel>}
        </div>
      </div>
    </>
  );
}
