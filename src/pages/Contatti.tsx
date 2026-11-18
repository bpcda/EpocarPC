import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { SmartLink } from "@/components/cms/CmsContent";
import { useSiteSettings } from "@/hooks/use-cms";

const TOPICS = [
  { title: "Eventi e raduni", description: "Informazioni sui prossimi appuntamenti.", subject: "Informazioni eventi" },
  { title: "Entrare in Epocar", description: "Domande sull’associazione e sull’adesione.", subject: "Informazioni adesione" },
  { title: "Collaborazioni", description: "Progetti, partnership e idee da condividere.", subject: "Proposta di collaborazione" },
];

const FALLBACK_SOCIAL = [
  { label: "Instagram", url: "https://instagram.com/epocar.official" },
  { label: "TikTok", url: "https://tiktok.com/@epocar" },
];

export default function ContattiPage() {
  const [selectedTopic, setSelectedTopic] = useState(0);
  const { data: settings } = useSiteSettings();
  const email = settings?.email ?? "epocarpc@gmail.com";
  const social = settings?.social.length ? settings.social : FALLBACK_SOCIAL;
  const subject = TOPICS[selectedTopic].subject;

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
                <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}>
                  Scrivici un’email <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <a href={`mailto:${email}`} className="block w-fit max-w-full break-words text-sm underline underline-offset-4 mt-5 hover:opacity-75">
                {email}
              </a>
            </div>

            <div role="group" aria-labelledby="contact-topics">
              <h2 id="contact-topics" className="text-xs font-medium uppercase tracking-[0.2em] mb-3">Di cosa vuoi parlare?</h2>
              {TOPICS.map((topic, index) => (
                <Button
                  key={topic.subject}
                  type="button"
                  variant="ghost"
                  aria-pressed={selectedTopic === index}
                  onClick={() => setSelectedTopic(index)}
                  className={`w-full h-auto justify-between gap-6 whitespace-normal border-b py-6 px-0 text-left font-body tracking-normal hover:bg-transparent hover:text-foreground ${selectedTopic === index ? "border-foreground" : "border-border"}`}
                >
                  <span>
                    <span className="block text-lg font-medium">{topic.title}</span>
                    <span className="block text-sm text-muted-foreground font-normal mt-2 leading-relaxed">{topic.description}</span>
                  </span>
                  {selectedTopic === index ? <Check aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
                </Button>
              ))}
              <p className="text-sm text-muted-foreground mt-5" aria-live="polite">Oggetto email: {subject}</p>
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
