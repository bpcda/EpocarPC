import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Paperclip, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CODES, codeLabel, euro, type Transaction } from "@/lib/treasury";
import { TEMPLATE_ACCOUNTS } from "@/lib/treasury-template-lists";
import { ErrorBox, Loading, PageHeader, Pager, StatusBadge, fmtDate, selectCls, useQueryState, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

const PER_PAGE = 25;
const SORTS: Record<string, keyof Transaction> = { data: "transaction_date", importo: "amount", voce: "excel_code", descrizione: "description", soggetto: "subject", conto: "account", tipo: "type" };

export default function Movements() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const [sp, set] = useQueryState();
  const navigate = useNavigate();
  const q = sp.get("search") ?? "", tipo = sp.get("tipo") ?? "", voce = sp.get("voce") ?? "", conto = sp.get("conto") ?? "", doc = sp.get("doc") ?? "";
  const sort = SORTS[sp.get("ordina") ?? ""] ? (sp.get("ordina") as string) : "data";
  const asc = sp.get("dir") === "asc";
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase(), k = SORTS[sort];
    return data.transactions.filter((t) =>
      (!s || [t.description, t.subject, t.document_number, t.notes, t.excel_code].some((x) => x?.toLowerCase().includes(s))) &&
      (!tipo || t.type.toLowerCase() === tipo.toLowerCase()) && (!voce || t.excel_code === voce) && (!conto || t.account.toLowerCase() === conto.toLowerCase()) &&
      (!doc || (doc === "con" ? !!t.attachment_path : !t.attachment_path)),
    ).sort((a, b) => { const x = a[k] ?? "", y = b[k] ?? ""; return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
  }, [data, q, tipo, voce, conto, doc, sort, asc]);

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const locked = data.years.find((y) => y.year === year)?.status !== "open";
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PER_PAGE, Math.min(page, pages) * PER_PAGE);
  const activeFilters = [tipo, voce, conto, doc].filter(Boolean).length;
  const newHref = `/tesoreria/movimenti/nuovo?anno=${year}`;
  const th = (key: string, label: string, cls = "") => (
    <TableHead className={`cursor-pointer select-none ${cls}`} onClick={() => set({ ordina: key, dir: sort === key && !asc ? "asc" : null })}>
      {label}{sort === key ? (asc ? " ↑" : " ↓") : ""}
    </TableHead>
  );

  return (
    <>
      <PageHeader crumbs={[{ label: "Movimenti" }]} title="Movimenti" subtitle={`Esercizio ${year} · ${rows.length} di ${data.transactions.length} movimenti`}
        actions={!locked && <Button asChild className="hidden md:inline-flex h-11"><Link to={newHref}><Plus className="h-4 w-4 mr-1" />Nuovo movimento</Link></Button>} />

      <div className="space-y-3 mb-4">
        <Input type="search" placeholder="Cerca descrizione, soggetto, documento…" value={q} onChange={(e) => set({ search: e.target.value })} className="h-11 text-base md:text-sm" />
        <Collapsible defaultOpen={activeFilters > 0}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="h-11 w-full md:w-auto"><SlidersHorizontal className="h-4 w-4 mr-2" />Filtri{activeFilters ? ` (${activeFilters})` : ""}</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3">
            <select aria-label="Tipo" className={selectCls} value={tipo} onChange={(e) => set({ tipo: e.target.value })}><option value="">Entrate e uscite</option><option value="entrata">Entrate</option><option value="uscita">Uscite</option></select>
            <select aria-label="Voce" className={selectCls} value={voce} onChange={(e) => set({ voce: e.target.value })}><option value="">Tutte le voci</option>{CODES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.label}</option>)}</select>
            <select aria-label="Conto" className={selectCls} value={TEMPLATE_ACCOUNTS.find((a) => a.toLowerCase() === conto.toLowerCase()) ?? ""} onChange={(e) => set({ conto: e.target.value })}><option value="">Tutti i conti</option>{TEMPLATE_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
            <select aria-label="Giustificativo" className={selectCls} value={doc} onChange={(e) => set({ doc: e.target.value })}><option value="">Con/senza giustificativo</option><option value="con">Con giustificativo</option><option value="senza">Senza giustificativo</option></select>
            {activeFilters > 0 && <Button variant="ghost" className="h-11 sm:col-span-2 lg:col-span-4 justify-start" onClick={() => set({ tipo: null, voce: null, conto: null, doc: null })}>Azzera filtri</Button>}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Mobile: tappable cards */}
      <ul className="md:hidden space-y-2">
        {shown.length === 0 && <li className="border border-border bg-card p-6 text-center text-muted-foreground">Nessun movimento.</li>}
        {shown.map((t) => (
          <li key={t.id}>
            <Link to={`/tesoreria/movimenti/${t.id}`} className="flex items-center gap-3 border border-border bg-card p-4 active:bg-muted">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground">{fmtDate(t.transaction_date)} · {t.excel_code}</p>
                <p className="font-medium text-foreground truncate">{t.subject || t.description}</p>
                {t.subject && <p className="text-sm text-muted-foreground truncate">{t.description}</p>}
                <p className="text-sm"><span className={t.type === "Entrata" ? "text-accent" : "text-foreground"}>{t.type} · {euro(t.amount)}</span></p>
                <p className="text-xs text-muted-foreground">{t.account} · {t.attachment_path ? "Giustificativo presente" : <span className="text-destructive">Giustificativo mancante</span>}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: full table */}
      <div className="hidden md:block border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            {th("data", "Data")}{th("tipo", "Tipo")}{th("voce", "Voce")}{th("descrizione", "Descrizione", "min-w-[12rem]")}{th("soggetto", "Soggetto", "hidden lg:table-cell")}{th("conto", "Conto")}{th("importo", "Importo", "text-right")}<TableHead>Doc.</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {shown.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Nessun movimento.</TableCell></TableRow>}
            {shown.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/tesoreria/movimenti/${t.id}`)}>
                <TableCell className="whitespace-nowrap">{fmtDate(t.transaction_date)}</TableCell>
                <TableCell><StatusBadge status={t.type} /></TableCell>
                <TableCell title={codeLabel(t.excel_code)} className="whitespace-nowrap">{t.excel_code}</TableCell>
                <TableCell><Link to={`/tesoreria/movimenti/${t.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{t.description}</Link><div className="text-xs text-muted-foreground">{t.payment_method}{t.document_number ? ` · Doc. ${t.document_number}` : ""}</div></TableCell>
                <TableCell className="hidden lg:table-cell">{t.subject || "—"}</TableCell>
                <TableCell>{t.account}</TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">{t.type === "Uscita" ? "−" : ""}{euro(t.amount)}</TableCell>
                <TableCell>{t.attachment_path ? <Paperclip className="h-4 w-4" aria-label="Giustificativo presente" /> : <span className="text-xs text-destructive">Manca</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={Math.min(page, pages)} pages={pages} onPage={(p) => set({ page: String(p) }, true)} />

      {!locked && (
        <Link to={newHref} className="md:hidden fixed right-4 bottom-20 z-30 flex items-center gap-2 h-14 px-5 bg-primary text-primary-foreground font-headline tracking-widest uppercase shadow-lg">
          <Plus className="h-5 w-5" />Movimento
        </Link>
      )}
    </>
  );
}
