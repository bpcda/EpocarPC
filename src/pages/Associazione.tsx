import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileDown, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import communityImage from "@/assets/community-gathering.jpeg";
import { loadAssociation, publicAssociationFile, type AssociationDocument, type Founder } from "@/lib/association";

export default function Associazione() {
  const [documents, setDocuments] = useState<AssociationDocument[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; loadAssociation().then(data => { if (active) { setDocuments(data.documents); setFounders(data.founders); } }).catch(() => {}).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const statute = documents.find(d => d.kind === "statute");
  return <>
    <PageMeta title="L’associazione — Epocar Piacenza" description="Il percorso di Epocar verso un’associazione: fondatori, statuto e richieste di adesione alla community dei motori storici di Piacenza." path="/associazione" />
    <Navbar />
    <main className="bg-foreground text-primary-foreground">
      <section className="relative min-h-[520px] flex items-end pt-32 pb-12">
        <img src={communityImage} alt="Appassionati della community riuniti a un ritrovo Epocar" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-foreground/80" />
        <div className="relative max-w-7xl w-full mx-auto px-6 lg:px-8">
          <p className="text-sm uppercase mb-5">Piacenza · Un nuovo capitolo</p>
          <h1 className="font-headline text-6xl md:text-8xl leading-none mb-6">Epocar<br />L’associazione</h1>
          <p className="max-w-xl text-primary-foreground/85 leading-relaxed">La passione per i motori storici ci unisce. Stiamo preparando il percorso per diventare un’associazione del Terzo Settore.</p>
          <p className="mt-4 text-sm text-primary-foreground/70">Il percorso ETS è in preparazione.</p>
        </div>
      </section>
      <nav aria-label="Sezioni dell’associazione" className="border-y border-primary-foreground/25">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-x-8 gap-y-3 py-5 font-headline text-xl">
          <a href="#fondatori" className="hover:underline">I fondatori</a><a href="#statuto" className="hover:underline">Lo statuto</a><Link to="/associazione/iscrizione" className="hover:underline">Diventa socio ↗</Link>
        </div>
      </nav>
      <section id="fondatori" className="max-w-7xl mx-auto px-6 lg:px-8 py-16 scroll-mt-24">
        <p className="text-sm text-primary-foreground/60 mb-3">01 / Le persone</p>
        <h2 className="text-5xl md:text-6xl mb-8">I fondatori</h2>
        {founders.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">{founders.map(f => <article key={f.id} className="border-t border-primary-foreground/25 pt-5">
          {f.photo_path ? <img src={publicAssociationFile("association-media", f.photo_path)} alt={f.name} className="w-full aspect-[4/3] object-contain mb-5" loading="lazy" /> : <Users className="h-10 w-10 mb-5 text-primary-foreground/50" />}
          <h3 className="text-3xl mb-3">{f.name}</h3><p className="text-primary-foreground/75 leading-relaxed whitespace-pre-line">{f.biography}</p>
        </article>)}</div> : <p className="max-w-xl text-primary-foreground/70">{loading ? "Caricamento…" : "Le persone che daranno vita all’associazione saranno presentate qui, insieme alle loro storie."}</p>}
      </section>
      <section id="statuto" className="border-y border-primary-foreground/25 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-8">
          <div><p className="text-sm text-primary-foreground/60 mb-3">02 / I principi</p><h2 className="text-5xl md:text-6xl">Lo statuto</h2></div>
          <div><p className="leading-relaxed text-primary-foreground/75 mb-6">Lo statuto definirà le finalità dell’associazione, la partecipazione dei soci e le regole della vita associativa.</p>
            {statute ? <Button variant="hero-secondary" asChild><a href={publicAssociationFile("association-documents", statute.path)} target="_blank" rel="noopener noreferrer"><FileDown /> Scarica lo statuto</a></Button> : <p className="text-sm text-primary-foreground/60">Lo statuto sarà disponibile dopo la sua approvazione.</p>}
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <p className="text-sm text-primary-foreground/60 mb-3">03 / Partecipare</p><h2 className="text-5xl md:text-6xl mb-5">Diventa socio</h2>
        <p className="max-w-xl leading-relaxed text-primary-foreground/75 mb-8">Un passo in più nella community Epocar. Le richieste di adesione si apriranno quando saranno disponibili lo statuto e il modulo di iscrizione.</p>
        <Button variant="hero-primary" asChild><Link to="/associazione/iscrizione">Adesione all’associazione <ArrowUpRight /></Link></Button>
      </section>
    </main><Footer />
  </>;
}