import { Link } from "react-router-dom";
import { Map, MessageCircle, Wallet } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";

export const futureFeatures = [
  {
    path: "/community/social",
    title: "Il social di Epocar",
    icon: MessageCircle,
    description: "Uno spazio interno per raccontare la tua passione, condividere foto e storie e conoscere altri appassionati.",
    detail: "L’idea è partire da una bacheca per gli iscritti al sito, con post e commenti. Prima dell’apertura definiremo moderazione, regole di partecipazione e visibilità dei contenuti: il tuo profilo e il tuo garage restano privati.",
  },
  {
    path: "/tessera-digitale",
    title: "La tessera nel Wallet",
    icon: Wallet,
    description: "La proposta per portare la tessera associativa su Apple Wallet e Google Wallet, direttamente sul telefono.",
    detail: "La futura tessera sarà dedicata ai soci con ammissione confermata e dati verificati dall’associazione. La registrazione al sito non rilascia una tessera. L’integrazione con i due Wallet è ancora da realizzare e verificare.",
  },
  {
    path: "/itinerari",
    title: "Itinerari da condividere",
    icon: Map,
    description: "Idee per giri in auto, moto e Vespa d’epoca: percorsi, tappe e luoghi da scoprire insieme.",
    detail: "Vorremmo raccogliere itinerari curati dalla community e dalla redazione, con informazioni utili per organizzare un’uscita. Per gli appuntamenti già disponibili puoi consultare la pagina Eventi.",
  },
];

export default function Novita() {
  return <>
    <PageMeta title="Le prossime novità — Epocar" description="Scopri le idee per il futuro del sito Epocar: social interno, tessera Wallet, itinerari. Funzioni in costruzione." path="/novita" />
    <Navbar />
    <main className="min-h-screen bg-foreground text-primary-foreground pt-32 pb-24 lg:pt-40">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <p className="text-sm uppercase tracking-widest mb-4">Il sito cresce con la community</p>
        <h1 className="font-headline text-5xl md:text-7xl tracking-wider mb-6">LE PROSSIME NOVITÀ</h1>
        <p className="max-w-2xl text-lg text-primary-foreground/85 leading-relaxed mb-4">Più occasioni per incontrarci e vivere la passione per i motori storici, anche tra un raduno e l’altro.</p>
        <p className="max-w-2xl text-primary-foreground/80 leading-relaxed mb-12">Queste sono anteprime di funzioni in costruzione: non sono ancora attive e non hanno una data di lancio. Intanto puoi creare gratuitamente il tuo account e scoprire gli eventi.</p>
        <div className="grid md:grid-cols-2 gap-6">
          {futureFeatures.map((feature) => <article key={feature.path} className="border border-primary-foreground/25 p-6 md:p-8">
            <feature.icon aria-hidden="true" className="h-8 w-8 mb-6" />
            <p className="text-sm uppercase tracking-widest text-primary-foreground/80 mb-3">In costruzione</p>
            <h2 className="font-headline text-3xl tracking-wider mb-4"><Link to={feature.path} className="underline underline-offset-4">{feature.title}</Link></h2>
            <p className="text-primary-foreground/85 leading-relaxed">{feature.description}</p>
          </article>)}
        </div>
        <div className="mt-12 flex flex-wrap gap-4">
          <Button variant="hero-primary" className="h-auto min-h-11 whitespace-normal" asChild><Link to="/auth?mode=signup">Crea il tuo account gratuito</Link></Button>
          <Button variant="hero-secondary" className="h-auto min-h-11 whitespace-normal" asChild><Link to="/eventi">Scopri gli eventi</Link></Button>
        </div>
        <p className="mt-5 text-primary-foreground/80">L’account del sito e l’ammissione a socio sono due percorsi distinti.</p>
      </div>
    </main>
    <Footer />
  </>;
}

export function InCostruzione({ feature }: { feature: typeof futureFeatures[number] }) {
  return <>
    <PageMeta title={`${feature.title} — In costruzione — Epocar`} description={feature.description} path={feature.path} noIndex />
    <Navbar />
    <main className="min-h-screen bg-foreground text-primary-foreground pt-32 pb-24 lg:pt-40">
      <div className="max-w-3xl mx-auto px-6 lg:px-8">
        <Link to="/novita" className="inline-block underline underline-offset-4 mb-12">Tutte le novità</Link>
        <feature.icon aria-hidden="true" className="h-10 w-10 mb-6" />
        <p className="text-sm uppercase tracking-widest mb-4">In costruzione</p>
        <h1 className="font-headline text-5xl md:text-7xl tracking-wider mb-6">{feature.title}</h1>
        <p className="text-lg text-primary-foreground/85 leading-relaxed mb-6">{feature.description}</p>
        <p className="text-primary-foreground/85 leading-relaxed mb-6">{feature.detail}</p>
        <p className="text-primary-foreground/80 leading-relaxed border-t border-primary-foreground/25 pt-6 mb-10">La funzione non è ancora disponibile. Annunceremo qui e nelle News gli aggiornamenti, senza una data di lancio prevista.</p>
        <div className="flex flex-wrap gap-4">
          <Button variant="hero-primary" className="h-auto min-h-11 whitespace-normal" asChild><Link to="/auth?mode=signup">Crea il tuo account gratuito</Link></Button>
          <Button variant="hero-secondary" className="h-auto min-h-11 whitespace-normal" asChild><Link to="/eventi">Scopri gli eventi</Link></Button>
        </div>
        <p className="mt-5 text-primary-foreground/80">Registrarsi al sito non equivale a diventare socio dell’associazione.</p>
      </div>
    </main>
    <Footer />
  </>;
}
