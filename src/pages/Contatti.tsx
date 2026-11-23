import { ArrowUpRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { SmartLink } from "@/components/cms/CmsContent";
import { useSiteSettings } from "@/hooks/use-cms";

const TOPICS = [
  { title: "Eventi e raduni", description: "Informazioni sui prossimi appuntamenti.", subject: "Informazioni eventi", body: "Ciao Epocar,\r\n\r\nvorrei partecipare a [nome del raduno o data]. Come posso iscrivermi?\r\n\r\nGrazie,\r\n[nome]" },
  { title: "Entrare in Epocar", description: "Domande sull’associazione e sull’adesione.", subject: "Informazioni adesione", body: "Ciao Epocar,\r\n\r\nvorrei entrare in Epocar. Potreste indicarmi come fare domanda e qual è la quota associativa?\r\n\r\nGrazie,\r\n[nome]" },
  { title: "Collaborazioni", description: "Progetti, partnership e idee da condividere.", subject: "Proposta di collaborazione", body: "Ciao Epocar,\r\n\r\nsono [nome] e vorrei proporvi una collaborazione: [descrivi brevemente la tua idea]. Possiamo sentirci per parlarne?\r\n\r\nGrazie,\r\n[nome]" },
];

const FALLBACK_SOCIAL = [
  { label: "Instagram", url: "https://instagram.com/epocar.official" },
  { label: "TikTok", url: "https://tiktok.com/@epocar" },
];

export default function ContattiPage() {
  const { data: settings } = useSiteSettings();
  const email = settings?.email ?? "epocarpc@gmail.com";
  const social = settings?.social.length ? settings.social : FALLBACK_SOCIAL;

  return (
    <>
      <PageMeta
        title="Contatti — Epocar Piacenza"
        description="Contatta Epocar: scrivici per informazioni sui raduni, per unirti alla community o per collaborare con noi a Piacenza."
        path="/contatti"
      />
      <Navbar />
      <main className="bg-background text-foreground pt-32 pb-16 lg:pt-40 lg:pb-24">
        <section className="max-w-7xl mx-auto px-6 lg:px-8" aria-labelledby="contact-title">
          <p className="text-xs font-medium uppercase tracking-[0.2em] mb-8">Contatti · Piacenza</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
            <div>
              <h1 id="contact-title" className="font-headline text-6xl sm:text-8xl lg:text-9xl leading-none tracking-wide">
                PARLIAMO<br />DI MOTORI.<br />E DI IDEE.
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mt-6 mb-8">
                Un raduno, una collaborazione o una curiosità su Epocar. Il primo passo è scriverci.
              </p>
              <Button size="lg" asChild>
                <a href={`mailto:${email}`}>
                  Scrivici un’email <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <a href={`mailto:${email}`} className="block w-fit max-w-full break-words text-sm underline underline-offset-4 mt-5 hover:opacity-75">
                {email}
              </a>
            </div>

            <div role="group" aria-labelledby="contact-topics">
              <h2 id="contact-topics" className="text-xs font-medium uppercase tracking-[0.2em] mb-3">Di cosa vuoi parlare?</h2>
              {TOPICS.map((topic) => (
                <a
                  key={topic.subject}
                  href={`mailto:epocarpc@gmail.com?subject=${encodeURIComponent(topic.subject)}&body=${encodeURIComponent(topic.body)}`}
                  className="flex w-full items-center justify-between gap-6 border-b border-border py-6 text-left hover:border-foreground focus-visible:outline-offset-4"
                >
                  <span>
                    <span className="block text-lg font-medium">{topic.title}</span>
                    <span className="block text-sm text-muted-foreground font-normal mt-2 leading-relaxed">{topic.description}</span>
                  </span>
                  <ArrowUpRight aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <div className="border-t border-border mt-16 lg:mt-24 pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">La community continua sui social.</p>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {social.map((link) => (
                <SmartLink key={link.url} href={link.url} className="inline-flex items-center gap-2 min-h-11 text-sm underline underline-offset-4 hover:opacity-75">
                  {link.label} <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                </SmartLink>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
