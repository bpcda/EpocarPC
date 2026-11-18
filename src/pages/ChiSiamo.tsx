import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import communityImage from "@/assets/community-gathering.jpeg";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function ChiSiamo() {
  return (
    <>
      <PageMeta
        title="Chi Siamo — Epocar, passione motori d'epoca a Piacenza"
        description="Scopri chi siamo: una community giovane di Piacenza che coltiva la cultura di auto, moto e Vespa d'epoca attraverso raduni ed eventi."
        path="/chi-siamo"
      />
      <Navbar />
      <main className="min-h-screen bg-foreground">
        <section className="pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-7 bg-foreground text-primary-foreground p-10 lg:p-16 xl:p-20 pt-28 lg:pt-32">
              <p className="text-xs uppercase tracking-[0.2em] mb-6">Chi siamo · Piacenza</p>
              <h1 className="font-headline text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-tight mb-6">
                Una passione.<br />Tante storie.
              </h1>
              <div className="w-full h-0.5 bg-primary-foreground/30 mb-8" />
              <p className="text-base text-primary-foreground/80 leading-relaxed mb-6 max-w-xl">
                Epocar nasce a Piacenza dall'idea di un gruppo di giovani appassionati di auto, moto e Vespa d'epoca. Il nostro obiettivo è semplice: riportare i motori del passato nelle piazze di oggi e creare una community di persone che condividono la passione per i veicoli storici.
              </p>
              <p className="text-base text-primary-foreground/85 leading-relaxed mb-6 max-w-xl">Crediamo che i mezzi d'epoca siano storie, cultura e passione da vivere insieme. Per questo organizziamo eventi, ritrovi e iniziative dedicate a chi ama:</p>
              <ul className="list-disc list-inside text-primary-foreground/80 space-y-1 mb-6 text-base">
                <li>auto storiche</li>
                <li>moto d'epoca</li>
                <li>Vespa e scooter vintage</li>
                <li>youngtimer</li>
              </ul>
              <p className="text-base text-primary-foreground/80 leading-relaxed max-w-xl">
                Epocar vuole essere un punto di incontro per la nuova generazione di appassionati, dove condividere motori, amicizia e territorio.
              </p>
              <Button variant="hero-primary" asChild className="mt-8"><Link to="/eventi">Vieni al prossimo evento →</Link></Button>
            </div>
            <div className="lg:col-span-5">
              <img
                src={communityImage}
                alt="Community Epocar gathering"
                className="w-full h-full min-h-[400px] lg:min-h-[600px] object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
