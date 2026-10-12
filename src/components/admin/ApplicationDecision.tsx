import type { Submission } from "@/lib/association";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : null);

/** Read-only: admission decisions are taken in the private Treasury and synced here. */
export function ApplicationDecision({ app }: { app: Submission; onDone?: () => void }) {
  if (app.status === "draft") return <p className="text-xs text-muted-foreground">Bozza non ancora inviata dal richiedente.</p>;
  if (app.status === "approved") return <p className="text-xs text-muted-foreground">Ammissione registrata{fmt(app.approved_at ?? app.resolution_date) ? ` il ${fmt(app.approved_at ?? app.resolution_date)}` : ""}{app.resolution_ref ? ` · delibera n. ${app.resolution_ref}` : ""}</p>;
  if (app.status === "rejected") return <p className="text-xs text-muted-foreground">Domanda respinta{fmt(app.rejected_at ?? app.resolution_date) ? ` il ${fmt(app.rejected_at ?? app.resolution_date)}` : ""}</p>;
  if (app.status === "cancelled") return <p className="text-xs text-muted-foreground">Domanda annullata.</p>;
  return <p className="text-xs text-muted-foreground">In attesa della decisione del Consiglio Direttivo, registrata dalla Tesoreria.</p>;
}
