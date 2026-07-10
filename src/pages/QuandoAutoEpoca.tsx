import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

export default function QuandoAutoEpoca() {
  const publishedISO = "2026-07-10";
  const url = "https://epocar-drive-passion.lovable.app/articoli/quando-auto-diventa-epoca";

  return (
    <div className="min-h-screen bg-foreground">
      <PageMeta
        title="Quando un'auto diventa d'epoca? Guida ai requisiti in Italia"
        description="Guida pratica ai requisiti legali e tecnici per l'auto d'epoca in Italia: età minima, iscrizione ASI, differenza con auto storica, targa, bollo e assicurazione."
        path="/articoli/quando-auto-diventa-epoca"
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Quando un'auto diventa d'epoca? Guida ai requisiti in Italia",
            description:
              "Requisiti legali e tecnici per il riconoscimento di auto d'epoca in Italia: età, iscrizione ASI, differenze con auto storica, adempimenti.",
            datePublished: publishedISO,
            dateModified: publishedISO,
            author: { "@type": "Organization", name: "Epocar" },
            publisher: {
              "@type": "Organization",
              name: "Epocar",
              url: "https://epocar-drive-passion.lovable.app",
            },
            mainEntityOfPage: url,
          })}
        </script>
      </Helmet>
      <Navbar />
      <main>
        <article className="pt-32 pb-24 lg:pt-40 lg:pb-32">
          <div className="max-w-3xl mx-auto px-6">
            <Link
              to="/articoli"
              className="font-headline text-sm tracking-widest text-primary-foreground/50 hover:text-primary-foreground mb-8 inline-block transition-colors"
            >
              ← TORNA AGLI ARTICOLI
            </Link>

            <p className="text-primary-foreground/50 text-sm tracking-widest uppercase mb-4">
              Rubricar · Guida pratica
            </p>
            <h1 className="font-headline text-4xl md:text-6xl lg:text-7xl text-primary-foreground leading-none tracking-wider mb-6">
              QUANDO UN'AUTO DIVENTA D'EPOCA?
            </h1>
            <div className="w-24 h-0.5 bg-primary-foreground/30 mb-8" />
            <p className="text-lg text-primary-foreground/70 leading-relaxed mb-12">
              In Italia i termini "auto storica" e "auto d'epoca" vengono usati
              come sinonimi, ma il Codice della Strada e il regolamento ASI li
              distinguono con criteri precisi. Ecco la checklist per capire
              quando il tuo veicolo rientra davvero nella categoria d'epoca e
              cosa serve per ottenere il riconoscimento.
            </p>

            <div className="prose prose-invert prose-lg max-w-none text-primary-foreground/80 space-y-8">
              <section>
                <h2 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                  Auto d'epoca vs auto storica: la differenza
                </h2>
                <p>
                  L'<strong>auto d'epoca</strong> (art. 60 del Codice della
                  Strada) è un veicolo cancellato dal PRA per essere destinato
                  a raccolte, musei o esposizioni. Circola solo su strada in
                  occasione di raduni o manifestazioni autorizzate ed è
                  iscritta in un apposito elenco tenuto dal Centro Storico
                  Lancia, ASI o registri di marca riconosciuti.
                </p>
                <p>
                  L'<strong>auto storica</strong>, invece, ha almeno 20 anni,
                  mantiene la targa originale e può circolare liberamente. Se
                  supera i 30 anni ed è iscritta ad ASI o altro registro, gode
                  di bollo ridotto e assicurazione agevolata.
                </p>
              </section>

              <section>
                <h2 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                  I requisiti in sintesi
                </h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Età minima:</strong> almeno 30 anni dalla data di
                    prima immatricolazione per il pieno riconoscimento come
                    veicolo di interesse storico.
                  </li>
                  <li>
                    <strong>Conservazione:</strong> il veicolo deve essere in
                    condizioni conformi all'originale, con documentazione
                    fotografica e tecnica.
                  </li>
                  <li>
                    <strong>Iscrizione a un registro:</strong> ASI, Registro
                    Italiano FIAT, Registro Storico Lancia, Alfa Romeo,
                    Italiano Alfa Romeo o registri di marca ufficialmente
                    riconosciuti.
                  </li>
                  <li>
                    <strong>Certificato di rilevanza storica (CRS):</strong>
                    documento rilasciato dal registro che attesta i requisiti
                    e va trascritto al PRA.
                  </li>
                  <li>
                    <strong>Assicurazione dedicata:</strong> polizze speciali
                    per veicoli d'epoca, spesso vincolate all'iscrizione a un
                    club federato.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                  Come si ottiene il riconoscimento ASI
                </h2>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>
                    Iscrizione a un club federato ASI della propria zona.
                  </li>
                  <li>
                    Compilazione della domanda con dati di targa, telaio,
                    motore e libretto di circolazione.
                  </li>
                  <li>
                    Perizia tecnica da parte di un commissario ASI: verifica
                    di originalità, stato di conservazione e documentazione
                    fotografica.
                  </li>
                  <li>
                    Rilascio dell'<strong>Attestato di Storicità</strong> o
                    del <strong>Certificato di Rilevanza Storica</strong> a
                    seconda della categoria.
                  </li>
                  <li>
                    Trascrizione del CRS al PRA per ottenere l'annotazione
                    sulla carta di circolazione.
                  </li>
                </ol>
              </section>

              <section>
                <h2 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                  Bollo, assicurazione e circolazione
                </h2>
                <p>
                  I veicoli tra 20 e 29 anni pagano il bollo pieno; quelli
                  oltre i 30 anni con CRS beneficiano di una tassa di
                  circolazione forfettaria ridotta stabilita a livello
                  regionale (in molte regioni tra 25 e 30 euro l'anno).
                  L'assicurazione RC storica è più economica ma richiede
                  spesso patente da almeno 10 anni e limite chilometrico
                  annuo.
                </p>
                <p>
                  Le limitazioni al traffico nei centri urbani (ZTL, blocchi
                  Euro) possono prevedere deroghe per i veicoli con CRS:
                  verifica sempre il regolamento del proprio Comune.
                </p>
              </section>

              <section>
                <h2 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                  Checklist rapida per il proprietario
                </h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Verifica la data di prima immatricolazione sul libretto.</li>
                  <li>Raccogli fotografie dettagliate di interni, motore, telaio.</li>
                  <li>Recupera la documentazione originale (manuali, fatture, storia proprietari).</li>
                  <li>Contatta un club federato ASI o il registro di marca.</li>
                  <li>Preventiva una polizza RC storica prima della perizia.</li>
                  <li>Trascrivi il CRS al PRA appena ottenuto.</li>
                </ul>
              </section>

              <section>
                <h2 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                  Vivi la tua passione con Epocar
                </h2>
                <p>
                  Epocar è la community di Piacenza dedicata ad auto, moto e
                  Vespa d'epoca. Se stai valutando l'iscrizione del tuo
                  veicolo o vuoi confrontarti con altri appassionati,{" "}
                  <Link to="/eventi" className="underline">
                    partecipa ai nostri raduni
                  </Link>{" "}
                  o{" "}
                  <Link to="/contatti" className="underline">
                    scrivici
                  </Link>{" "}
                  per un consiglio pratico.
                </p>
              </section>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}