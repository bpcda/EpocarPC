import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { euro } from "@/lib/treasury";
import { ErrorBox, Loading, PageHeader, Pager, fmtDate, useQueryState, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

const PER_PAGE = 25;

export default function Documents() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const [sp, set] = useQueryState();
  const navigate = useNavigate();
  const q = sp.get("search") ?? "", stato = sp.get("stato") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.transactions ?? []).filter((t) =>
      (!s || [t.description, t.subject, t.document_number, t.attachment_name].some((x) => x?.toLowerCase().includes(s))) &&
      (!stato || (stato === "con" ? !!t.attachment_path : !t.attachment_path))).sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));
  }, [data, q, stato]);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE)), p = Math.min(page, pages);
  const shown = rows.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  const missing = data.transactions.filter((t) => !t.attachment_path).length;

  return (
    <>
      <PageHeader crumbs={[{ label: "Documenti" }]} title="Documenti" subtitle={`Esercizio ${year} · ${data.transactions.length - missing} giustificativi, ${missing} mancanti`} />
      <div className="space-y-3 mb-4">
        <Input type="search" className="h-11 text-base md:text-sm" placeholder="Cerca movimento, documento, file…" value={q} onChange={(e) => set({ search: e.target.value })} />
        <div className="flex gap-2">
          {[["", "Tutti"], ["con", "Presenti"], ["senza", "Mancanti"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ stato: k || null })} className={`h-11 px-4 border text-sm ${stato === k ? "border-primary-foreground bg-card text-foreground" : "border-border text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      <ul className="md:hidden space-y-2">
        {shown.length === 0 && <li className="border border-border bg-card p-6 text-center text-muted-foreground">Nessun documento.</li>}
        {shown.map((t) => (
          <li key={t.id}><Link to={`/tesoreria/documenti/${t.id}`} className="flex items-center gap-3 border border-border bg-card p-4">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">{fmtDate(t.transaction_date)} · {t.type} · {euro(t.amount)}</p>
              <p className="font-medium truncate">{t.description}</p>
              <p className={`text-sm truncate ${t.attachment_path ? "text-muted-foreground" : "text-destructive"}`}>{t.attachment_name ?? "Giustificativo mancante"}</p>
            </div><ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link></li>
        ))}
      </ul>
      <div className="hidden md:block border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Movimento</TableHead><TableHead className="text-right">Importo</TableHead><TableHead>Documento</TableHead><TableHead>Giustificativo</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Nessun documento.</TableCell></TableRow>}
            {shown.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/tesoreria/documenti/${t.id}`)}>
                <TableCell className="whitespace-nowrap">{fmtDate(t.transaction_date)}</TableCell><TableCell>{t.description}</TableCell><TableCell className="text-right">{euro(t.amount)}</TableCell>
                <TableCell className="text-sm">{t.document_number ? `N. ${t.document_number}${t.document_date ? ` del ${fmtDate(t.document_date)}` : ""}` : "—"}</TableCell>
                <TableCell className="text-sm">{t.attachment_name ?? <span className="text-destructive">Mancante</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={p} pages={pages} onPage={(n) => set({ page: String(n) }, true)} />
    </>
  );
}
