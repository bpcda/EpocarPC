import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { useFaqs } from "@/hooks/use-cms";
import { RichTextView } from "@/components/cms/CmsContent";

export default function Faq() {
  const { data = [], isLoading } = useFaqs();
  return (
    <>
      <PageMeta title="Domande frequenti — Epocar" description="Risposte alle domande più comuni su Epocar, eventi e associazione." path="/faq" />
      <Navbar />
      <main className="pt-28 pb-24 min-h-screen">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <h1 className="font-headline text-6xl md:text-8xl tracking-wider text-foreground leading-none mb-12">FAQ</h1>
          {isLoading ? <p role="status" className="text-muted-foreground">Caricamento…</p>
            : data.length === 0 ? <p className="text-muted-foreground">Nessuna domanda frequente pubblicata al momento.</p>
            : (
              <div className="space-y-4">
                {data.map((f, i) => (
                  <details key={i} className="border-2 border-foreground p-5 group">
                    <summary className="font-headline text-2xl tracking-wide text-foreground cursor-pointer">{f.question}</summary>
                    <div className="mt-4"><RichTextView value={f.answer} /></div>
                  </details>
                ))}
              </div>
            )}
        </div>
      </main>
      <Footer />
    </>
  );
}
