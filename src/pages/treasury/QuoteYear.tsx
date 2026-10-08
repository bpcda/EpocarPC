import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Settings, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { euro, memberDues, summary } from "@/lib/treasury";
import { ErrorBox, Kpi, Loading, PageHeader, StatusBadge, fmtDate, useQueryState, useTreasuryData, useTreasuryYear } from "@/components/treasury/shared";

const STATI = ["Pagato", "Parzialmente pagato", "Da pagare", "Esente", "Quota non deliberata"];

export default function QuoteYear() {
  const year = useTreasuryYear();
  const { data, error, isLoading } = useTreasuryData(year);
  const [sp, set] = useQueryState();
  const navigate = useNavigate();
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const s = summary(data, year);
  const all = memberDues(data, year);
  const stato = sp.get("stato") ?? "";
  const dues = stato ? all.filter((d) => d.status === stato) : all;
  const count = (st: string) => all.filter((d) => d.status === st).length;
  const open = data.years.find((y) => y.year === year)?.status === "open";
  const pay = (id: string) => `/tesoreria/movimenti/nuovo?anno=${year}&socio=${id}`;
  const edit = (id: string) => `/tesoreria/quote/${year}/soci/${id}`;

  return (
    <>
      <PageHeader crumbs={[{ label: "Quote", to: "/tesoreria/quote" }, { label: String(year) }]} title="Quote soci" subtitle={`Esercizio ${year} · quote secondo la delibera del Consiglio Direttivo`}
        actions={<>
          <Button asChild variant="outline" className="h-11"><Link to={`/tesoreria/quote/${year}/impostazioni`}><Settings className="h-4 w-4 mr-1" />Quote deliberate</Link></Button>
          <Button asChild className="h-11"><Link to={`/tesoreria/quote/${year}/soci/nuovo`}><Plus className="h-4 w-4 mr-1" />Nuovo socio</Link></Button>
        </>} />
      {data.fees === null && <p className="mb-4 border border-border bg-card p-3 text-sm text-muted-foreground">Per le quote deliberate esegui <a className="underline" href="/setup/treasury-v2.sql" target="_blank" rel="noreferrer">l’aggiornamento SQL</a>.</p>}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Kpi label="Dovuto" value={euro(s.duesTotal)} /><Kpi label="Incassato" value={euro(s.duesPaid)} /><Kpi label="Residuo" value={euro(s.duesOpen)} warn={s.duesOpen > 0} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {[["", `Tutti (${all.length})`], ["Pagato", `Pagati (${count("Pagato")})`], ["Parzialmente pagato", `Parziali (${count("Parzialmente pagato")})`], ["Da pagare", `Da pagare (${count("Da pagare")})`], ...STATI.slice(3).filter(count).map((x) => [x, `${x} (${count(x)})`])].map(([k, l]) => (
          <button key={k} type="button" onClick={() => set({ stato: k || null })} className={`h-11 px-4 whitespace-nowrap border text-sm ${stato === k ? "border-primary-foreground bg-card text-foreground" : "border-border text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      <ul className="md:hidden space-y-2">
        {dues.length === 0 && <li className="border border-border bg-card p-6 text-center text-muted-foreground">Nessun socio.</li>}
        {dues.map((d) => (
          <li key={d.member.id} className="border border-border bg-card">
            <Link to={edit(d.member.id)} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-medium text-foreground truncate">{d.member.full_name}</p>
                <p className="text-xs text-muted-foreground">{d.member.category}{d.member.member_number ? ` · N. ${d.member.member_number}` : ""}</p>
                <p className="text-sm">Versato {euro(d.paid)} di {euro(d.due)}</p>
                <StatusBadge status={d.status} />
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </Link>
            {open && d.residual > 0 && <Link to={pay(d.member.id)} className="flex items-center justify-center gap-2 h-11 border-t border-border text-sm uppercase tracking-widest"><Wallet className="h-4 w-4" />Registra pagamento {euro(d.residual)}</Link>}
          </li>
        ))}
      </ul>

      <div className="hidden md:block border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Socio</TableHead><TableHead>N.</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Dovuta</TableHead><TableHead className="text-right">Versato</TableHead><TableHead className="text-right">Residuo</TableHead><TableHead className="hidden lg:table-cell">Ultimo pagamento</TableHead><TableHead>Stato</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {dues.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Nessun socio.</TableCell></TableRow>}
            {dues.map((d) => (
              <TableRow key={d.member.id} className="cursor-pointer" onClick={() => navigate(edit(d.member.id))}>
                <TableCell className="font-medium">{d.member.full_name}</TableCell><TableCell>{d.member.member_number || "—"}</TableCell><TableCell>{d.member.category}</TableCell>
                <TableCell className="text-right">{euro(d.due)}</TableCell><TableCell className="text-right">{euro(d.paid)}</TableCell><TableCell className="text-right">{euro(d.residual)}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{d.last ? `${fmtDate(d.last)} · ${d.method}` : "—"}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>{open && d.residual > 0 && <Button asChild size="sm" variant="outline"><Link to={pay(d.member.id)}><Wallet className="h-4 w-4 mr-1" />Incassa</Link></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
