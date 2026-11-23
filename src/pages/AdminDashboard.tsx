import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CalendarDays, Newspaper, Images, ClipboardList, Users, ShieldCheck, Landmark, Plus, Pencil, Trash2, LogOut, ArrowUpRight, Search, RefreshCw } from "lucide-react";
import ShootingAgenda from "@/components/admin/ShootingAgenda";
import GalleryTab from "@/components/admin/GalleryTab";
import RegistrationsTab from "@/components/admin/RegistrationsTab";
import UsersTab from "@/components/admin/UsersTab";
import RoleAuditTab from "@/components/admin/RoleAuditTab";
import AssociationTab from "@/components/admin/AssociationTab";
import { MEMBER_CARDS_OWNER_ID } from "../../setup/functions/member-card-management/owner";
import { articleDate, articleState, type ArticleTiming } from "@/lib/article-publication";
import { formatEventDate } from "@/lib/event-time";
import type { Tables } from "@/integrations/supabase/types";

type Event = Pick<Tables<"events">, "id" | "title" | "date" | "location" | "published" | "created_at"> & ArticleTiming;
type Article = Pick<Tables<"articles">, "id" | "title" | "published" | "created_at"> & ArticleTiming;
const sections = [
  { value: "events", label: "Eventi", description: "Prepara gli incontri e ritrova gli appuntamenti pubblicati.", icon: CalendarDays },
  { value: "articles", label: "News", description: "Le notizie online, le bozze e le prossime uscite.", icon: Newspaper },
  { value: "gallery", label: "Gallery", description: "Le immagini che raccontano la community.", icon: Images },
  { value: "registrations", label: "Iscrizioni eventi", description: "Partecipanti e prenotazioni, raccolti per evento.", icon: ClipboardList },
  { value: "association", label: "Associazione", description: "Documenti, presentazione e richieste di adesione.", icon: Landmark },
  { value: "shooting", label: "Shooting", description: "Appuntamenti e richieste di Natale su Ruote.", icon: CalendarDays, adminOnly: true },
  { value: "users", label: "Utenti", description: "Account del sito e permessi di accesso.", icon: Users, adminOnly: true },
  { value: "role-audit", label: "Storico ruoli", description: "Le modifiche ai ruoli degli utenti.", icon: ShieldCheck, adminOnly: true },
];
const statusLabels = { draft: "Bozza", now: "Pubblicata", scheduled: "Programmata" };
const statusStyle = { draft: "bg-muted text-muted-foreground", now: "bg-emerald-50 text-emerald-800", scheduled: "bg-amber-50 text-amber-900" };
const fmt = (date: string, scheduled = false) => date ? new Date(date).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric", ...(scheduled ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "Data automatica alla pubblicazione";

export default function AdminDashboard() {
  const { user, isAdmin, isStaff, isTreasurer, signOut } = useAuth();
  const onlyTreasury = isTreasurer && !isAdmin && !isStaff;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const available = sections.filter(section => !section.adminOnly || isAdmin);
  const section = available.find(item => item.value === params.get("tab")) ?? available[0];
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<{ table: "events" | "articles"; id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const eventsQuery = useQuery({ queryKey: ["admin", "events", user?.id], enabled: !onlyTreasury, queryFn: async () => {
    const { data, error } = await supabase.from("events").select("id,title,date,location,published,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Event[];
  } });
  const articlesQuery = useQuery({ queryKey: ["admin", "articles", user?.id], enabled: !onlyTreasury, refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await supabase.from("articles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Article[];
  } });
  const events = eventsQuery.data ?? [];
  const articles = articlesQuery.data ?? [];
  const switchTab = (value: string) => { setParams({ tab: value }); setSearch(""); setFilter("all"); setError(""); };
  const newsTab = section.value === "articles";
  const contentTab = newsTab || section.value === "events";
  const query = newsTab ? articlesQuery : eventsQuery;
  const rows: (Article & { date?: string | null; location?: string | null })[] = newsTab ? articles : events;
  const matching = rows.filter(row => row.title.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")) && (filter === "all" || articleState(row) === filter));
  const drafts = rows.filter(row => !row.published).length;
  const scheduled = newsTab ? articles.filter(row => articleState(row) === "scheduled").length : 0;

  const deleteContent = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!pendingDelete || deleting || !isAdmin) return;
    setDeleting(true); setError("");
    try {
      const result = await supabase.from(pendingDelete.table).delete().eq("id", pendingDelete.id).select("id").single();
      if (result.error || !result.data) throw new Error("delete");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", pendingDelete.table] }),
        queryClient.invalidateQueries({ queryKey: [pendingDelete.table] }),
      ]);
      setPendingDelete(null);
    } catch { setError("Non possiamo confermare l’eliminazione. Aggiorna l’elenco prima di riprovare."); }
    finally { setDeleting(false); }
  };

  return <div className="min-h-screen bg-background">
    <header className="bg-foreground text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-headline text-2xl tracking-wide">Epocar <span className="font-body text-xs uppercase tracking-widest ml-2">Gestione sito</span></p><p className="text-xs text-primary-foreground/80 mt-1 break-all">{user?.email}</p></div>
        <div className="flex flex-wrap items-center gap-2">{user?.id === MEMBER_CARDS_OWNER_ID && <Button variant="ghost" className="min-h-11 text-inherit hover:bg-white/10 hover:text-inherit" asChild><Link to="/gestione-tessere">Tessere socio</Link></Button>}<Button variant="ghost" className="min-h-11 text-inherit hover:bg-white/10 hover:text-inherit" asChild><Link to="/">Vedi il sito <ArrowUpRight className="h-4 w-4 ml-2" /></Link></Button><Button variant="ghost" className="min-h-11 text-inherit hover:bg-white/10 hover:text-inherit" onClick={async () => { await signOut(); navigate("/admin/login"); }}><LogOut className="h-4 w-4 mr-2" /> Esci</Button></div>
      </div>
    </header>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
      {onlyTreasury ? <p role="status" className="border border-border bg-card p-6 text-muted-foreground">Nessuna funzione disponibile su questo portale per il tuo profilo.</p> : <Tabs value={section.value} onValueChange={switchTab} className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-6 lg:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-6 self-start">
          <div className="lg:hidden space-y-2">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="dashboard-section">Sezione</Label>{isAdmin && <a href="https://cms.epocarpc.com/admin" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs underline underline-offset-4">Pagine · Strapi <ArrowUpRight className="h-3 w-3" /></a>}</div>
            <Select value={section.value} onValueChange={switchTab}><SelectTrigger id="dashboard-section" className="min-h-12 bg-card"><SelectValue /></SelectTrigger><SelectContent>{available.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <p className="hidden lg:block text-xs uppercase tracking-widest text-muted-foreground mb-4">Il tuo spazio</p>
          <TabsList aria-label="Sezioni della dashboard" className="hidden lg:grid lg:grid-cols-1 h-auto gap-1 p-1 bg-secondary items-stretch">
            {available.map(({ value, label, icon: Icon }) => <TabsTrigger key={value} value={value} className="min-h-12 px-3 py-3 gap-2 justify-start whitespace-normal text-left leading-snug transition-none data-[state=active]:bg-foreground data-[state=active]:text-primary-foreground"><Icon className="h-4 w-4 shrink-0" /><span>{label}</span></TabsTrigger>)}
          </TabsList>
          <div className="hidden lg:flex mt-6 flex-col gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center min-h-9">{isAdmin ? "Amministratore" : "Staff · Eventi e News in sola lettura"}</span>
            {isAdmin && <a href="https://cms.epocarpc.com/admin" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 underline underline-offset-4">Pagine del sito · Strapi <ArrowUpRight className="h-3 w-3" /></a>}
          </div>
        </aside>
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div className="min-w-0"><h1 className="font-headline text-4xl sm:text-5xl">{section.label}</h1><p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-xl">{section.description}</p></div>
            {contentTab && isAdmin && <Button className="min-h-11 w-full sm:w-auto" onClick={() => navigate(newsTab ? "/admin/articoli/nuovo" : "/admin/eventi/nuovo")}><Plus className="h-4 w-4 mr-2" />{newsTab ? "Nuova notizia" : "Nuovo evento"}</Button>}
          </div>
          {error && !pendingDelete && <p role="alert" className="mb-4 border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
          {contentTab && <TabsContent value={section.value} className="m-0">
            {!query.isError && !query.isPending && <dl className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
              {[{ label: "Totali", value: rows.length }, { label: "Bozze", value: drafts }, { label: newsTab ? "Programmate" : "Pubblicati", value: newsTab ? scheduled : rows.length - drafts }].map(stat => <div key={stat.label} className="border border-border bg-card px-3 sm:px-5 py-4"><dt className="text-xs text-muted-foreground break-words">{stat.label}</dt><dd className="font-headline text-3xl sm:text-4xl mt-2">{stat.value}</dd></div>)}
            </dl>}
            <div className="border border-border bg-card p-3 sm:p-4 grid grid-cols-[minmax(0,1fr)_44px] sm:flex gap-3 mb-4">
              <div className="relative col-span-2 flex-1 min-w-0"><Label htmlFor="content-search" className="sr-only">{newsTab ? "Cerca nelle news" : "Cerca negli eventi"}</Label><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="content-search" type="search" className="pl-9 min-h-11" placeholder={newsTab ? "Cerca una notizia…" : "Cerca un evento…"} value={search} onChange={e => setSearch(e.target.value)} /></div>
              <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filtra per stato" className="sm:w-44 min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti gli stati</SelectItem><SelectItem value="draft">Bozze</SelectItem><SelectItem value="now">Pubblicati</SelectItem>{newsTab && <SelectItem value="scheduled">Programmati</SelectItem>}</SelectContent></Select>
              <Button variant="outline" size="icon" aria-label="Aggiorna elenco" className="min-h-11 min-w-11 self-end sm:self-auto" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} /></Button>
            </div>
            {query.isPending ? <p role="status" className="border border-border p-8 text-center text-sm text-muted-foreground">Caricamento dei contenuti…</p>
              : query.isError ? <div role="alert" className="border border-border p-6"><p className="text-sm mb-4">Non riusciamo a caricare l’elenco. Nessun contenuto è stato modificato.</p><Button variant="outline" onClick={() => query.refetch()}>Riprova</Button></div>
              : matching.length === 0 ? <div className="border border-dashed border-border p-8 sm:p-12 text-center"><h2 className="font-headline text-2xl mb-2">{rows.length ? "Nessun risultato" : newsTab ? "La prossima storia parte da qui" : "Prepariamo il prossimo incontro"}</h2><p className="text-sm text-muted-foreground">{rows.length ? "Prova un altro titolo o cambia il filtro." : isAdmin ? "Usa il pulsante in alto per creare il primo contenuto." : "Non ci sono ancora contenuti da consultare."}</p>{rows.length > 0 && <Button variant="outline" className="mt-4 min-h-11" onClick={() => { setSearch(""); setFilter("all"); }}>Azzera ricerca e filtri</Button>}</div>
              : <ul className="space-y-3" aria-label={newsTab ? "Elenco news" : "Elenco eventi"}>{matching.map(row => {
                const status = articleState(row);
                const editHref = newsTab ? `/admin/articoli/${row.id}` : `/admin/eventi/${row.id}`;
                return <li key={row.id}><article className="border border-border bg-card p-4 sm:p-5 grid md:grid-cols-[minmax(0,1fr)_auto] gap-4 md:items-center">
                  <div className="min-w-0"><span className={`inline-block text-xs font-medium px-2 py-1 ${statusStyle[status]}`}>{newsTab ? statusLabels[status] : status === "draft" ? "Bozza" : "Pubblicato"}</span><h2 className="font-body font-semibold text-base sm:text-lg leading-snug break-words mt-3">{isAdmin ? <Link to={editHref} className="hover:underline underline-offset-4">{row.title}</Link> : row.title}</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-2 break-words">{newsTab ? status === "draft" && !row.published_at ? "Bozza · data assegnata alla pubblicazione" : `${status === "scheduled" ? "Online dal " : "Data notizia · "}${fmt(articleDate(row), status === "scheduled")}` : row.date ? formatEventDate({ date: row.date }, true) : "Data da definire"}</p>
                    {!newsTab && row.location && <p className="text-xs text-muted-foreground mt-1 break-words">{row.location}</p>}
                  </div>
                  {isAdmin && <div className="flex gap-2 border-t border-border pt-3 md:pt-0 md:border-0"><Button variant="outline" className="min-h-11 flex-1 md:flex-none" asChild><Link to={editHref} aria-label={`Modifica ${row.title}`}><Pencil className="h-4 w-4 mr-2" />Modifica</Link></Button><Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive" aria-label={`Elimina ${row.title}`} onClick={() => { setError(""); setPendingDelete({ table: newsTab ? "articles" : "events", id: row.id, title: row.title }); }}><Trash2 className="h-4 w-4" /></Button></div>}
                </article></li>;
              })}</ul>}
            {!query.isPending && !query.isError && <p role="status" className="text-xs text-muted-foreground mt-4">{matching.length} {matching.length === 1 ? "contenuto" : "contenuti"}{search || filter !== "all" ? ` su ${rows.length}` : ""}</p>}
          </TabsContent>}
          <TabsContent value="gallery" className="m-0"><GalleryTab userId={user?.id} /></TabsContent>
          <TabsContent value="registrations" className="m-0"><RegistrationsTab /></TabsContent>
          <TabsContent value="association" className="m-0"><AssociationTab /></TabsContent>
          {isAdmin && user && <TabsContent value="shooting"><ShootingAgenda owner={user.id} /></TabsContent>}
          {isAdmin && <TabsContent value="users" className="m-0"><UsersTab /></TabsContent>}
          {isAdmin && <TabsContent value="role-audit" className="m-0"><RoleAuditTab /></TabsContent>}
        </div>
      </Tabs>}
    </main>
    <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open && !deleting) { setPendingDelete(null); setError(""); } }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare {pendingDelete?.table === "events" ? "l’evento" : "la notizia"}?</AlertDialogTitle><AlertDialogDescription className="break-words">«{pendingDelete?.title}» verrà eliminato definitivamente. Puoi annullare per mantenerlo.</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={deleteContent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? "Eliminazione…" : "Elimina definitivamente"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}
