import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEMBER_CARDS_OWNER_ID, loadMemberCards, downloadMemberCard, downloadAllMemberCards, type ManagedMemberCard } from "@/lib/member-card-management";

const statuses = { valid: "Tessera valida", invalid: "Tessera non valida", unavailable: "Validità da verificare" };

export default function GestioneTessere() {
  const { user } = useAuth();
  const allowed = user?.id === MEMBER_CARDS_OWNER_ID;
  const query = useQuery({ queryKey: ["managed-member-cards", user?.id], queryFn: loadMemberCards, enabled: allowed, gcTime: 0, refetchInterval: 30000, retry: false });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const cards = query.data ?? [];
  const matching = cards.filter(card => `${card.full_name} ${card.card_number}`.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")));
  const download = async (card?: ManagedMemberCard, format: "png" | "svg" = "png") => {
    setBusy(card?.id ?? "all"); setError("");
    try { if (card) await downloadMemberCard(card, format); else await downloadAllMemberCards(cards); }
    catch { setError("Download non riuscito. Riprova oppure scarica il formato SVG."); }
    finally { setBusy(""); }
  };
  return <>
    <PageMeta title="Tessere socio — Epocar" description="Gestione riservata dei codici personali delle tessere Epocar." path="/gestione-tessere" noIndex />
    <Navbar />
    <main className="min-h-screen bg-background pt-28 pb-20 lg:pt-36">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <Link to="/account" className="inline-block underline underline-offset-4 mb-8">Il mio account</Link>
        <h1 className="font-headline text-5xl md:text-7xl tracking-wider mb-5">TESSERE SOCIO</h1>
        {!allowed ? <p role="alert">Questa sezione è riservata al titolare.</p> : <>
          <p className="max-w-3xl leading-relaxed text-muted-foreground mb-4">I codici dei nuovi soci compaiono automaticamente quando arrivano dalla Tesoreria l’ammissione confermata e la quota pagata o esente. Puoi riscaricarli quando vuoi: il QR resta lo stesso anche ai rinnovi.</p>
          <p className="max-w-3xl text-sm text-muted-foreground mb-8">Solo il tuo account può accedere a questa sezione. Scansiona il QR con Pass2U e pubblica soltanto la tessera individuale, mantenendo invariato il codice.</p>
          <div className="flex flex-wrap gap-3 mb-8">
            <Button className="min-h-11" onClick={() => download()} disabled={!!busy || !cards.length || query.isError}><Download aria-hidden="true" />{busy === "all" ? "Preparazione ZIP…" : "Scarica tutti (ZIP)"}</Button>
            <Button variant="outline" className="min-h-11" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw aria-hidden="true" />Aggiorna elenco</Button>
          </div>
          {error && <p role="alert" className="border border-destructive/40 p-4 mb-6">{error}</p>}
          {query.isPending ? <p role="status">Caricamento tessere…</p> : query.isError ? <p role="alert">Impossibile caricare le tessere. Verifica l’accesso con il tuo account e aggiorna l’elenco.</p> : <>
            <div className="max-w-md mb-8"><Label htmlFor="card-search">Cerca per nome o numero tessera</Label><Input id="card-search" className="mt-2" value={search} onChange={event => setSearch(event.target.value)} /></div>
            <p className="text-sm text-muted-foreground mb-5">{cards.length} tessere disponibili</p>
            {!cards.length ? <p>Le tessere appariranno qui dopo la conferma dell’ammissione e della quota dalla Tesoreria.</p> : !matching.length ? <p>Nessuna tessera corrisponde alla ricerca.</p> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {matching.map(card => <article key={card.id} className="border border-border bg-card p-5 sm:p-6">
                <h2 className="font-headline text-3xl tracking-wide break-words">{card.full_name}</h2>
                <p className="mt-2">Tessera n. {card.card_number} · {card.category}</p>
                <p className="text-sm font-medium mt-3">{statuses[card.status]}</p>
                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.svg)}`} alt={`Codice QR tessera n. ${card.card_number}`} className="w-full max-w-80 aspect-square mx-auto my-5 bg-white" width="320" height="320" />
                <div className="flex flex-wrap gap-3">
                  <Button className="min-h-11" onClick={() => download(card)} disabled={!!busy}>Scarica PNG</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => download(card, "svg")} disabled={!!busy}>SVG</Button>
                  <a href={card.url} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 underline underline-offset-4">Verifica</a>
                </div>
              </article>)}
            </div>}
          </>}
        </>}
      </div>
    </main>
    <Footer />
  </>;
}
