import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { verifyMemberCard, type CardVerification } from "@/lib/member-card";

const labels = { valid: "Tessera valida", invalid: "Tessera non valida", unavailable: "Verifica non disponibile" };
const icons = { valid: CheckCircle2, invalid: XCircle, unavailable: CircleHelp };

export default function VerificaTessera() {
  const { hash } = useLocation();
  const token = hash.slice(1);
  const [result, setResult] = useState<CardVerification | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null);
    if (token) verifyMemberCard(token).then(value => { if (active) setResult(value); });
    return () => { active = false; };
  }, [token, attempt]);
  const Icon = result ? icons[result.status] : CircleHelp;
  return <>
    <PageMeta title="Verifica tessera — Epocar" description="Verifica la validità di una tessera associativa Epocar tramite il suo QR personale." path="/verifica-tessera" noIndex />
    <Helmet><meta name="referrer" content="no-referrer" /></Helmet>
    <Navbar />
    <main className="min-h-[75vh] bg-foreground text-primary-foreground pt-32 pb-24 lg:pt-40">
      <div className="max-w-2xl mx-auto px-6 lg:px-8">
        <p className="text-sm uppercase tracking-widest mb-4">Associazione Epocar</p>
        <h1 className="font-headline text-5xl md:text-7xl tracking-wider mb-10">VERIFICA TESSERA</h1>
        {!token ? <p>Scansiona il QR personale presente sulla tessera per verificarne la validità.</p> : !result ? <p role="status">Verifica in corso…</p> : <div role="status" aria-live="polite" className="border border-primary-foreground/30 p-6 md:p-8">
          <Icon aria-hidden="true" className="h-10 w-10 mb-5" />
          <h2 className="font-headline text-3xl tracking-wider mb-4">{labels[result.status]}</h2>
          {result.card_number && <p className="text-lg mb-4">Tessera n. {result.card_number}</p>}
          {result.status === "valid" && result.valid_until && <p className="mb-4">Validità verificabile fino al {new Date(`${result.valid_until}T12:00:00`).toLocaleDateString("it-IT")}, salvo variazioni dello stato associativo.</p>}
          {result.status === "valid" && result.renewal_due && <p className="mb-4">Periodo di rinnovo: la quota annuale deve risultare pagata o esente entro l’ultimo giorno di febbraio.</p>}
          {result.status === "invalid" && <p>La tessera non risulta valida per l’utilizzo. Per informazioni, il titolare può contattare la segreteria.</p>}
          {result.status === "unavailable" && <p>Non è possibile confermare la validità con i dati disponibili. Riprova tra poco; se il problema continua, contatta la segreteria.</p>}
          {result.checked_at && <p className="text-sm text-primary-foreground/80 mt-6">Controllo: {new Date(result.checked_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</p>}
          {result.source_updated_at && <p className="text-sm text-primary-foreground/80 mt-2">Dati ricevuti dalla Tesoreria: {new Date(result.source_updated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</p>}
        </div>}
        {token && result && <Button variant="hero-secondary" className="mt-6" onClick={() => setAttempt(n => n + 1)}>Aggiorna verifica</Button>}
        <p className="mt-8 text-primary-foreground/80 leading-relaxed">La scansione controlla la tessera e non registra una visita o il completamento di una tappa.</p>
      </div>
    </main>
    <Footer />
  </>;
}
