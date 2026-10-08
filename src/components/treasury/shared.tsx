import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadTreasury } from "@/lib/treasury";

export const selectCls = "h-11 w-full border border-input bg-background px-3 text-base md:text-sm text-foreground [&>option]:bg-background [&>option]:text-foreground";

export const defaultYear = () => Math.max(2026, new Date().getFullYear());
const validYear = (v: number) => Number.isInteger(v) && v >= 2000 && v <= 2100;

/** Year from `/:anno` first, then `?anno=`, else the current fiscal year. */
export function useTreasuryYear() {
  const { anno } = useParams();
  const [sp] = useSearchParams();
  const v = Number(anno ?? sp.get("anno"));
  return validYear(v) ? v : defaultYear();
}

export function useTreasuryData(year: number) {
  return useQuery({ queryKey: ["treasury", year], queryFn: () => loadTreasury(year), staleTime: 30_000, retry: false });
}
export function useRefreshTreasury() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ["treasury"] }), [qc]);
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("it-IT") : "—");
export const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

export type Crumb = { label: string; to?: string };

/** Back respects browser history when the user came from inside the app, else goes to a sensible parent. */
export function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return (
    <Button variant="ghost" className="h-11 -ml-3 px-3" onClick={() => (idx > 0 ? navigate(-1) : navigate(fallback))}>
      <ArrowLeft className="h-4 w-4 mr-1" />Indietro
    </Button>
  );
}

export function PageHeader({ crumbs, title, subtitle, actions, back }: { crumbs: Crumb[]; title: string; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <header className="space-y-2 mb-6">
      {back && <BackButton fallback={back} />}
      <nav aria-label="Percorso" className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
        {[{ label: "Tesoreria", to: "/tesoreria" }, ...crumbs].map((c, i, a) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
            {c.to && i < a.length - 1 ? <Link to={c.to} className="hover:text-foreground underline-offset-4 hover:underline truncate">{c.label}</Link> : <span className="truncate text-foreground/80">{c.label}</span>}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="font-headline text-3xl md:text-4xl tracking-wide text-foreground uppercase break-words">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-border bg-card p-4 min-w-0">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-xl md:text-2xl font-headline mt-1 break-words ${warn ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

const BADGE: Record<string, string> = {
  Pagato: "bg-accent/15 text-accent", Esente: "bg-muted text-muted-foreground", "Parzialmente pagato": "bg-secondary text-secondary-foreground",
  "Da pagare": "bg-destructive/15 text-destructive", "Quota non deliberata": "bg-destructive/15 text-destructive",
  Entrata: "bg-accent/15 text-accent", Uscita: "bg-muted text-muted-foreground", open: "bg-accent/15 text-accent", closed: "bg-muted text-muted-foreground",
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-block text-xs uppercase tracking-wider px-2 py-1 whitespace-nowrap ${BADGE[status] ?? "bg-muted text-muted-foreground"}`}>{label ?? status}</span>;
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border border-border bg-card">
      {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">{title && <h2 className="font-headline text-lg tracking-wide text-foreground uppercase">{title}</h2>}{actions}</div>}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Loading() { return <p className="text-muted-foreground py-16 text-center">Caricamento…</p>; }
export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="border border-border bg-card p-6 space-y-2">
      <p className="font-medium text-foreground">{error instanceof Error ? error.message : "Errore di caricamento"}</p>
      <p className="text-sm text-muted-foreground">Se la Tesoreria non è ancora installata esegui <a className="underline" href="/setup/treasury.sql" target="_blank" rel="noreferrer">questo script SQL</a> e poi <a className="underline" href="/setup/treasury-v2.sql" target="_blank" rel="noreferrer">l’aggiornamento</a> sulla tua istanza.</p>
    </div>
  );
}

export const UNSAVED_MSG = "Ci sono modifiche non salvate. Vuoi uscire?";
/**
 * Warns before leaving a dirty form: on reload/close (beforeunload) and on any in-app link click
 * (capture listener runs before React Router handles the click). Browser back is covered by drafts.
 */
export function useUnsavedGuard(dirty: boolean) {
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (ref.current) { e.preventDefault(); e.returnValue = ""; } };
    const click = (e: MouseEvent) => {
      if (!ref.current) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (a && !a.hasAttribute("download") && a.getAttribute("target") !== "_blank" && !window.confirm(UNSAVED_MSG)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, []);
  return useCallback(() => !ref.current || window.confirm(UNSAVED_MSG), []);
}

/** Session-only draft for an accounting form: survives an accidental refresh, never reaches the database. */
export function useSessionDraft<T>(key: string) {
  const k = `treasury-draft:${key}`;
  return {
    read: (): T | null => { try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
    write: (v: T) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } },
    clear: () => sessionStorage.removeItem(k),
  };
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <Button variant="outline" className="h-11" disabled={page <= 1} onClick={() => onPage(page - 1)}>Precedente</Button>
      <span className="text-sm text-muted-foreground">Pagina {page} di {pages}</span>
      <Button variant="outline" className="h-11" disabled={page >= pages} onClick={() => onPage(page + 1)}>Successiva</Button>
    </div>
  );
}

/** Updates query params in place (replace) so refresh/copy keep the view; resets page on filter change. */
export function useQueryState() {
  const [sp, setSp] = useSearchParams();
  const set = useCallback((patch: Record<string, string | null>, keepPage = false) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") n.delete(k); else n.set(k, v); }
      if (!keepPage && !("page" in patch)) n.delete("page");
      return n;
    }, { replace: true });
  }, [setSp]);
  return [sp, set] as const;
}
