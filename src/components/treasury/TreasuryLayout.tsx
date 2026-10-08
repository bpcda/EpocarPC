import { useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BarChart3, BookOpen, CalendarRange, FileText, History, LayoutDashboard, ListOrdered, Menu, PiggyBank, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { defaultYear, selectCls, useTreasuryData, useTreasuryYear } from "./shared";

const sections = (y: number) => [
  { to: "/tesoreria", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/tesoreria" },
  { to: `/tesoreria/movimenti?anno=${y}`, label: "Movimenti", icon: ListOrdered, match: (p: string) => p.startsWith("/tesoreria/movimenti") },
  { to: `/tesoreria/quote/${y}`, label: "Quote soci", short: "Quote", icon: Users, match: (p: string) => p.startsWith("/tesoreria/quote") },
  { to: `/tesoreria/budget/${y}`, label: "Budget", icon: PiggyBank, match: (p: string) => p.startsWith("/tesoreria/budget") },
  { to: `/tesoreria/rendiconto/${y}`, label: "Rendiconto", icon: BarChart3, match: (p: string) => p.startsWith("/tesoreria/rendiconto") },
  { to: `/tesoreria/documenti?anno=${y}`, label: "Documenti", icon: FileText, match: (p: string) => p.startsWith("/tesoreria/documenti") },
  { to: "/tesoreria/esercizi", label: "Esercizi", icon: CalendarRange, match: (p: string) => p.startsWith("/tesoreria/esercizi") },
  { to: "/tesoreria/audit", label: "Audit log", short: "Audit", icon: History, match: (p: string) => p.startsWith("/tesoreria/audit") },
];

/** Route-level permission: only the treasurer role (admin/staff/president never imply it). RLS enforces the same on the server. */
export function TreasuryGuard() {
  const { user, canAccessTreasury, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Caricamento…</p></div>;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!canAccessTreasury) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="border border-border bg-card p-8 max-w-md space-y-3 text-center">
        <h1 className="font-headline text-3xl uppercase text-foreground">Accesso riservato</h1>
        <p className="text-sm text-muted-foreground">La Tesoreria è accessibile solo al Tesoriere.</p>
        <Link to="/" className="inline-block underline text-foreground">Torna al sito</Link>
      </div>
    </div>
  );
  return <TreasuryLayout />;
}

function TreasuryLayout() {
  const year = useTreasuryYear();
  const { data } = useTreasuryData(year);
  const loc = useLocation();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [more, setMore] = useState(false);
  const items = sections(year);
  const p = loc.pathname;

  const years = [...new Set([...(data?.years ?? []).map((y) => y.year), year, defaultYear()])].sort((a, b) => b - a);
  const changeYear = (y: number) => {
    if (/^\/tesoreria\/(quote|budget|rendiconto|esercizi)\/\d{4}/.test(p)) return navigate(p.replace(/\/\d{4}/, `/${y}`) + loc.search);
    const m = p.match(/^\/tesoreria\/(movimenti|documenti)\/.+/);
    if (m) return navigate(`/tesoreria/${m[1]}?anno=${y}`);
    const n = new URLSearchParams(sp); n.set("anno", String(y)); n.delete("page");
    navigate(`${p}?${n}`);
  };
  const fy = data?.years.find((y) => y.year === year);
  const mobileMain = [items[0], items[1], items[2]];
  const moreActive = !mobileMain.some((i) => i.match(p));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 md:px-6 h-14">
          <Link to="/admin" className="hidden md:inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
          <Link to="/tesoreria" className="font-headline text-xl tracking-[0.15em] uppercase mr-auto flex items-center gap-2"><BookOpen className="h-5 w-5" />Tesoreria</Link>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="hidden sm:inline">Esercizio</span>
            <select aria-label="Esercizio" className={`${selectCls} w-28 h-10`} value={year} onChange={(e) => changeYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {fy && <span className="hidden sm:inline text-[11px] uppercase tracking-widest border border-border px-2 py-1 text-muted-foreground">{fy.status === "open" ? "Aperto" : "Chiuso"}</span>}
        </div>
      </header>

      <div className="flex">
        <aside className="hidden md:block w-56 lg:w-60 shrink-0 border-r border-border min-h-[calc(100vh-3.5rem)] sticky top-14 self-start">
          <nav className="py-4 flex flex-col">
            {items.map((i) => (
              <NavLink key={i.label} to={i.to} className={() => `flex items-center gap-3 px-5 h-11 text-sm uppercase tracking-widest border-l-4 transition-colors ${i.match(p) ? "border-primary bg-card text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card/60"}`}>
                <i.icon className="h-4 w-4" />{i.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6 pb-28 md:pb-10 max-w-6xl">
          {data && !fy && (
            <div className="mb-4 border border-border bg-card p-3 text-sm text-muted-foreground">
              L’esercizio {year} non è ancora aperto. <Link className="underline text-foreground" to={`/tesoreria/esercizi/${year}`}>Apri l’esercizio</Link>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <nav aria-label="Sezioni tesoreria" className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {mobileMain.map((i) => (
          <Link key={i.label} to={i.to} className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] uppercase tracking-wider ${i.match(p) ? "text-foreground bg-card" : "text-muted-foreground"}`}>
            <i.icon className="h-5 w-5" />{i.short ?? i.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMore(true)} className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] uppercase tracking-wider ${moreActive ? "text-foreground bg-card" : "text-muted-foreground"}`}>
          <Menu className="h-5 w-5" />Altro
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-none">
          <SheetHeader><SheetTitle className="font-headline tracking-widest uppercase">Tesoreria</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {items.slice(3).map((i) => (
              <Link key={i.label} to={i.to} onClick={() => setMore(false)} className={`flex items-center gap-2 h-14 px-4 border border-border text-sm uppercase tracking-wider ${i.match(p) ? "bg-card text-foreground" : "text-muted-foreground"}`}>
                <i.icon className="h-4 w-4" />{i.label}
              </Link>
            ))}
            <Link to="/admin" onClick={() => setMore(false)} className="flex items-center gap-2 h-14 px-4 border border-border text-sm uppercase tracking-wider text-muted-foreground"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
