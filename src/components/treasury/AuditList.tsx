import { useAuth } from "@/hooks/use-auth";
import type { AuditEntry } from "@/lib/treasury";
import { fmtDateTime } from "./shared";

export const TABLE_LABELS: Record<string, string> = {
  treasury_transactions: "Movimenti", treasury_budgets: "Budget", association_members: "Soci",
  treasury_fiscal_years: "Esercizi", treasury_fee_schedules: "Quote deliberate",
};
const OP: Record<string, string> = { create: "Creazione", update: "Modifica", delete: "Eliminazione" };
const HIDDEN = new Set(["id", "created_at", "updated_at", "created_by", "fiscal_year", "attachment_path"]);

function diff(e: AuditEntry) {
  const o = e.old_data ?? {}, n = e.new_data ?? {};
  return [...new Set([...Object.keys(o), ...Object.keys(n)])]
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
    .map((k) => ({ k, from: o[k], to: n[k] }));
}
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function AuditList({ rows, showTable = false }: { rows: AuditEntry[]; showTable?: boolean }) {
  const { user } = useAuth();
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nessuna modifica registrata.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((e) => {
        const changes = e.operation === "update" ? diff(e) : [];
        const who = e.changed_by === user?.id ? "Tu" : e.changed_by ? `Utente ${e.changed_by.slice(0, 8)}` : "Sistema";
        return (
          <li key={e.id} className="border border-border p-3 text-sm">
            <p className="flex flex-wrap gap-x-2 text-foreground">
              <span className="font-medium">{OP[e.operation]}</span>
              {showTable && <span className="text-muted-foreground">· {TABLE_LABELS[e.table_name] ?? e.table_name}</span>}
              <span className="text-muted-foreground">· {fmtDateTime(e.created_at)} · {who}</span>
            </p>
            {changes.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground break-words">
                {changes.slice(0, 12).map((c) => <li key={c.k}><span className="text-foreground">{c.k}</span>: {show(c.from)} → {show(c.to)}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
