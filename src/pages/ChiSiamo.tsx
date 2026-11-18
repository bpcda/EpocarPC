import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { CmsImg, RichTextView } from "@/components/cms/CmsContent";
import { useCmsPage } from "@/hooks/use-cms";
import communityImage from "@/assets/community-gathering.jpeg";
import vespaImage from "@/assets/gallery-3.jpeg";

const INTRO = "Siamo Epocar, una community nata a Piacenza attorno alla passione per auto, moto, Vespa e youngtimer. Ci piacciono i motori che hanno una storia. Ancora di più, le persone con cui condividerla.";
const VALUES = [
  { number: "01", title: "Ci incontriamo.", text: "Nelle piazze, ai raduni, davanti a un cofano aperto. Ogni appuntamento è un’occasione per conoscersi." },
  { number: "02", title: "Ci scambiamo storie.", text: "Un restauro, un ricordo di famiglia, una curiosità. L’esperienza di qualcuno diventa una scoperta per tutti." },
  { number: "03", title: "Facciamo strada.", text: "Portiamo i veicoli storici nella vita di oggi, con incontri e iniziative che uniscono generazioni e territorio." },
];

export default function ChiSiamo() {
  const { data: page } = useCmsPage("chi-siamo");
  const story = page?.blocks.find(block => block.kind === "text");
  const hero = page?.heroImage ?? { url: communityImage, alt: "Appassionati di diverse generazioni riuniti a un incontro Epocar a Piacenza", width: 1280, height: 960 };

  return (
    <>
      <PageMeta
        title={page?.seo.title ?? "Chi siamo — Le persone, la passione, Epocar"}
        description={page?.seo.description ?? page?.excerpt ?? "Epocar nasce a Piacenza per condividere la passione per auto, moto, Vespa e youngtimer. Scopri le persone e lo spirito dei nostri incontri."}
        path="/chi-siamo"
        image={page?.seo.image?.url ?? page?.heroImage?.url}
      />
      <Navbar />
      <main className="bg-background text-foreground">
        <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-28 lg:pt-36 pb-12 lg:pb-16" aria-labelledby="about-title">
          <div className="flex justify-between items-center gap-4 border-b border-border pb-5 mb-8 lg:mb-10 text-xs uppercase tracking-[0.18em]">
            <p>Chi siamo</p>
            <p>Piacenza, Italia</p>
          </div>
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end mb-10 lg:mb-14">
            <h1 id="about-title" className="lg:col-span-8 font-headline text-[clamp(2.75rem,7.6vw,7.5rem)] leading-[0.98] tracking-wide whitespace-pre-line break-words">
              {page?.title ?? "Prima le persone.\nPoi i motori."}
            </h1>
            <div className="lg:col-span-4">
              <p className="text-base lg:text-lg leading-relaxed text-foreground/85">{page?.excerpt ?? INTRO}</p>
              <a href="#storia" className="inline-flex items-center gap-3 min-h-11 text-sm underline underline-offset-4 mt-5">
                La nostra storia <ArrowDown className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure>
            <CmsImg image={hero} eager sizes="(min-width: 1280px) 1216px, 100vw" className="w-full aspect-[4/3] md:aspect-[2/1] object-cover object-[center_35%]" />
            <figcaption className="flex flex-col sm:flex-row justify-between gap-2 mt-4 text-xs text-muted-foreground">
              <span>Una community, tante generazioni.</span>
              <span>Il punto di partenza è incontrarsi.</span>
            </figcaption>
          </figure>
        </section>

        <section id="storia" className="max-w-7xl mx-auto px-6 lg:px-8 py-12 lg:py-20 scroll-mt-24" aria-labelledby="story-title">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-20 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-5">Le nostre strade si incontrano qui</p>
              <h2 id="story-title" className="font-headline text-4xl md:text-5xl lg:text-6xl leading-tight tracking-wide mb-6">Una passione che<br />esce dal garage.</h2>
              {story ? <RichTextView value={story.body} /> : <div className="space-y-5 text-base text-foreground/85 leading-relaxed max-w-xl">
                <p>Epocar nasce dall’idea di un gruppo di giovani appassionati: riportare i motori del passato nelle piazze di oggi e creare occasioni per viverli insieme.</p>
                <p>Ci ritroviamo attorno ad auto storiche, moto, Vespa e youngtimer. C’è chi conosce ogni dettaglio del proprio mezzo e chi si avvicina a questo mondo per la prima volta. La curiosità e la voglia di condividere ci fanno parlare la stessa lingua.</p>
              </div>}
              <Link to="/associazione" className="inline-flex items-center gap-3 min-h-11 text-sm underline underline-offset-4 mt-7">Conosci l’associazione <ArrowUpRight className="w-4 h-4" aria-hidden="true" /></Link>
            </div>
            <figure>
              <img src={vespaImage} alt="Vespa e scooter storici riuniti all’aperto durante un incontro" width={2048} height={1356} className="w-full aspect-[3/2] object-cover" loading="lazy" decoding="async" />
              <figcaption className="text-xs text-muted-foreground mt-4">Auto, moto, Vespa e youngtimer. Storie diverse, la stessa passione.</figcaption>
            </figure>
          </div>
        </section>

        <section className="bg-foreground text-primary-foreground py-14 lg:py-20" aria-labelledby="values-title">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-10 lg:mb-12">
              <h2 id="values-title" className="font-headline text-4xl md:text-5xl tracking-wide leading-tight">Quello che ci mette in moto.</h2>
              <p className="text-sm text-primary-foreground/85 max-w-xs leading-relaxed">I veicoli sono il punto d’incontro.<br />Il resto lo costruiamo insieme.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
              {VALUES.map(value => <div key={value.number} className="border-t border-primary-foreground/30 pt-6">
                <p className="text-xs tracking-widest text-primary-foreground/80 mb-5">{value.number}</p>
                <h3 className="font-headline text-3xl tracking-wide mb-4">{value.title}</h3>
                <p className="text-sm lg:text-base leading-relaxed text-primary-foreground/85 max-w-sm">{value.text}</p>
              </div>)}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-8 lg:gap-16 items-center" aria-labelledby="join-title">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-5">Il prossimo capitolo si vive insieme</p>
            <h2 id="join-title" className="font-headline text-4xl md:text-5xl lg:text-6xl tracking-wide leading-tight">C’è posto anche<br />per la tua passione.</h2>
          </div>
          <div>
            <p className="text-base text-foreground/85 leading-relaxed max-w-lg mb-7">Porta il tuo mezzo, una storia da raccontare o semplicemente la curiosità di conoscerci. Gli incontri Epocar sono aperti anche a chi si avvicina per la prima volta ai motori storici.</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-6">
              <Button size="lg" className="max-w-full h-auto min-h-12 whitespace-normal" asChild><Link to="/eventi">Vieni al prossimo incontro <ArrowUpRight aria-hidden="true" /></Link></Button>
              <Link to="/contatti" className="inline-flex items-center gap-2 min-h-11 text-sm underline underline-offset-4">Parliamone <ArrowUpRight className="w-4 h-4" aria-hidden="true" /></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
