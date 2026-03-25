import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import communityImage from "@/assets/community-gathering.jpg";

export default function ChiSiamo() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <section className="pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-7 bg-foreground text-primary-foreground p-10 lg:p-16 xl:p-20 pt-28 lg:pt-32">
              <h1 className="font-headline text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-none mb-2">
                CHI SIAMO
              </h1>
              <div className="w-full h-0.5 bg-primary-foreground/30 mb-8" />
              <p className="text-base text-primary-foreground/80 leading-relaxed mb-6 max-w-xl">
                Epocar nasce a Piacenza dall'idea di un gruppo di giovani appassionati di auto, moto e Vespa d'epoca. Il nostro obiettivo è semplice: riportare i motori del passato nelle piazze di oggi e creare una community di persone che condividono la passione per i veicoli storici. Crediamo che i mezzi d'epoca non siano solo oggetti da collezione, ma storie, cultura e passione da vivere insieme. Per questo organizziamo eventi, ritrovi e iniziative dedicate a chi ama:
              </p>
              <ul className="list-disc list-inside text-primary-foreground/80 space-y-1 mb-6 text-base">
                <li>auto storiche</li>
                <li>moto d'epoca</li>
                <li>Vespa e scooter vintage</li>
                <li>youngtimer</li>
              </ul>
              <p className="text-base text-primary-foreground/80 leading-relaxed max-w-xl">
                Epocar vuole essere un punto di incontro per la nuova generazione di appassionati, dove condividere motori, amicizia e territorio.
              </p>
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
