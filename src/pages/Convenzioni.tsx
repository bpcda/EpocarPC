import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { BlockRenderer } from "@/components/cms/CmsContent";
import { useCmsPage } from "@/hooks/use-cms";
import raduno from "@/assets/community-gathering.jpeg";

export default function Convenzioni() {
  const { data: pagina, isLoading } = useCmsPage("convenzioni");
  return <>
    <PageMeta title="Convenzioni per i soci — EPOCAR" description="Sconti e agevolazioni riservati ai soci dalle attività convenzionate con EPOCAR." path="/convenzioni" />
    <Navbar />
    <main>
      <header className="bg-foreground pt-28 text-primary-foreground lg:pt-36">
        <div className="mx-auto grid max-w-7xl items-end gap-8 px-6 lg:grid-cols-2 lg:px-8">
          <div className="pb-2 lg:pb-14">
            <h1 className="font-headline text-6xl leading-none tracking-wide md:text-8xl">Convenzioni per i soci</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed">Le attività convenzionate riservano ai soci EPOCAR sconti, servizi o altre agevolazioni. Per ogni proposta trovi qui le condizioni e come usufruirne.</p>
          </div>
          <img src={raduno} alt="" className="h-48 w-full object-cover sm:h-64 lg:h-80" />
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-14 lg:py-20">
        <h2 className="mb-6 font-headline text-4xl tracking-wide">Attività convenzionate</h2>
        {isLoading ? <p role="status">Caricamento delle convenzioni…</p> : pagina?.blocks.length
          ? <BlockRenderer blocks={pagina.blocks} />
          : <p className="text-muted-foreground">Al momento non ci sono convenzioni pubblicate.</p>}
        <aside className="mt-12 border-l-2 border-primary pl-5">
          <h2 className="font-headline text-2xl">Il ruolo di EPOCAR</h2>
          <p className="mt-2 max-w-2xl leading-relaxed">Il vantaggio è riservato ai soci. EPOCAR non riceve compensi, commissioni o altri benefici dalle convenzioni. I post dedicati servono a informare i soci sulle opportunità disponibili.</p>
          <Link to="/news" className="mt-4 inline-block underline underline-offset-4">Leggi le news di EPOCAR</Link>
        </aside>
      </section>
    </main>
    <Footer />
  </>;
}
