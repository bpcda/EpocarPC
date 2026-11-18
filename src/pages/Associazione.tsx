import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileDown, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import communityImage from "@/assets/community-gathering.jpeg";
import { loadAssociation, loadPeople, publicAssociationFile, personName, boardRole, BOARD_ROLES, type AssociationDocument, type PersonWithPhoto } from "@/lib/association";

export default function Associazione() {
  const [documents, setDocuments] = useState<AssociationDocument[]>([]);
  const [people, setPeople] = useState<PersonWithPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; Promise.all([loadAssociation().then(data => { if (active) setDocuments(data.documents); }).catch(() => {}), loadPeople().then(list => { if (active) setPeople(list); }).catch(() => {})]).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const founders = people.filter(p => p.roles.includes("founder"));
  const rank = (p: PersonWithPhoto) => { const b = boardRole(p); return b ? Object.keys(BOARD_ROLES).indexOf(b) : 99; };
  const board = people.filter(p => boardRole(p)).sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order);
  const card = (p: PersonWithPhoto, label?: string) => <article key={p.user_id} className="border-t border-primary-foreground/25 pt-5 flex items-center gap-4">
    {label && (p.photo ? <img src={p.photo} alt={personName(p)} className="w-20 h-20 shrink-0 object-cover rounded-full" loading="lazy" /> : <Users className="w-12 h-12 shrink-0 text-primary-foreground/80" aria-hidden="true" />)}
    <div className="min-w-0">
      {label && <p className="text-xs uppercase tracking-wide text-primary-foreground/85 mb-2">{label}</p>}
      <h3 className="text-2xl leading-tight break-words">{personName(p)}</h3>
    </div>
  </article>;
  const statute = documents.find(d => d.kind === "statute");
  return <>
    <PageMeta title="L’associazione — Epocar Piacenza" description="Fondatori, consiglio direttivo, statuto e domanda di adesione alla community dei motori storici di Piacenza." path="/associazione" />
    <Navbar />
    <main className="bg-foreground text-primary-foreground">
      <section className="relative min-h-[520px] flex items-end pt-32 pb-12">
        <img src={communityImage} alt="Appassionati della community riuniti a un ritrovo Epocar" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-foreground/80" />
        <div className="relative max-w-7xl w-full mx-auto px-6 lg:px-8">
          <p className="text-sm uppercase mb-5">Piacenza · Un nuovo capitolo</p>
          <h1 className="font-headline text-5xl sm:text-6xl md:text-8xl leading-none mb-6">Epocar<br />L’associazione</h1>
          <p className="max-w-xl text-primary-foreground/85 leading-relaxed">La passione per i motori storici ci unisce. Stiamo preparando il percorso per diventare un’associazione del Terzo Settore.</p>
          <p className="mt-4 text-sm text-primary-foreground/70">Il percorso ETS è in preparazione.</p>
          <Button variant="hero-primary" asChild className="mt-6"><Link to="/associazione/iscrizione">Presenta la domanda <ArrowUpRight /></Link></Button>
        </div>
      </section>
      <nav aria-label="Sezioni dell’associazione" className="border-y border-primary-foreground/25">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-x-8 gap-y-3 py-5 font-headline text-xl">
          <a href="#fondatori" className="hover:underline">I fondatori</a><a href="#consiglio" className="hover:underline">Consiglio direttivo</a><a href="#statuto" className="hover:underline">Lo statuto</a><Link to="/associazione/iscrizione" className="hover:underline">Diventa socio ↗</Link>
        </div>
      </nav>
      <section id="fondatori" className="max-w-7xl mx-auto px-6 lg:px-8 py-16 scroll-mt-24">
        <p className="text-sm text-primary-foreground/60 mb-3">01 / Le persone</p>
        <h2 className="text-5xl md:text-6xl mb-8">I fondatori</h2>
        {founders.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">{founders.map(p => card(p))}</div> : <p className="max-w-xl text-primary-foreground/70">{loading ? "Caricamento…" : "Le persone che daranno vita all’associazione saranno presentate qui."}</p>}
      </section>
      <section id="consiglio" className="border-t border-primary-foreground/25 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
          <p className="text-sm text-primary-foreground/60 mb-3">02 / Chi guida</p>
          <h2 className="text-5xl md:text-6xl mb-8">Consiglio direttivo</h2>
          {board.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">{board.map(p => { const r = boardRole(p); return card(p, r ? BOARD_ROLES[r] : undefined); })}</div> : <p className="max-w-xl text-primary-foreground/70">{loading ? "Caricamento…" : "La composizione del consiglio direttivo sarà pubblicata qui."}</p>}
        </div>
      </section>
      <section id="statuto" className="border-y border-primary-foreground/25 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-8">
          <div><p className="text-sm text-primary-foreground/60 mb-3">03 / I principi</p><h2 className="text-5xl md:text-6xl">Lo statuto</h2></div>
          <div><p className="leading-relaxed text-primary-foreground/85 mb-6">{statute ? "Consulta lo statuto per conoscere le finalità dell’associazione, la partecipazione dei soci e le regole della vita associativa." : "Lo statuto definirà le finalità dell’associazione, la partecipazione dei soci e le regole della vita associativa."}</p>
            {statute ? <Button variant="hero-secondary" asChild><a href={publicAssociationFile("association-documents", statute.path)} target="_blank" rel="noopener noreferrer"><FileDown /> Scarica lo statuto</a></Button> : <p className="text-sm text-primary-foreground/60">Lo statuto sarà disponibile dopo la sua approvazione.</p>}
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <p className="text-sm text-primary-foreground/60 mb-3">04 / Partecipare</p><h2 className="text-5xl md:text-6xl mb-5">Diventa socio</h2>
        <p className="max-w-xl leading-relaxed text-primary-foreground/75 mb-8">Un passo in più nella community Epocar. Puoi presentare online la domanda di ammissione: la compili in pochi passaggi e la salvi come bozza quando vuoi.</p>
        <Button variant="hero-primary" asChild><Link to="/associazione/iscrizione">Presenta la domanda <ArrowUpRight /></Link></Button>
      </section>
    </main><Footer />
  </>;
}
