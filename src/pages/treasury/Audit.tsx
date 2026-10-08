import { useQuery } from "@tanstack/react-query";
import { AUDIT_PAGE, loadAudit } from "@/lib/treasury";
import { AuditList, TABLE_LABELS } from "@/components/treasury/AuditList";
import { ErrorBox, Loading, PageHeader, Pager, selectCls, useQueryState } from "@/components/treasury/shared";

export default function Audit() {
  const [sp, set] = useQueryState();
  const table = sp.get("tabella") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = useQuery({ queryKey: ["treasury-audit", table, page], queryFn: () => loadAudit({ table: table || undefined, page }) });
  return (
    <>
      <PageHeader crumbs={[{ label: "Audit log" }]} title="Audit log" subtitle="Registro immutabile di tutte le operazioni contabili" />
      <select aria-label="Sezione" className={`${selectCls} sm:w-72 mb-4`} value={table} onChange={(e) => set({ tabella: e.target.value })}>
        <option value="">Tutte le sezioni</option>
        {Object.entries(TABLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {q.error ? <ErrorBox error={q.error} /> : q.isLoading || !q.data ? <Loading /> : (
        <>
          <p className="text-xs text-muted-foreground mb-3">{q.data.total} registrazioni</p>
          <AuditList rows={q.data.rows} showTable />
          <Pager page={page} pages={Math.max(1, Math.ceil(q.data.total / AUDIT_PAGE))} onPage={(p) => set({ page: String(p) }, true)} />
        </>
      )}
    </>
  );
}
