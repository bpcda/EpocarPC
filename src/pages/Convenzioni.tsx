import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { useBenefits } from "@/lib/member-benefits";
import raduno from "@/assets/community-gathering.jpeg";

export default function Convenzioni() {
  const offers = useBenefits();
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
        {offers.isPending ? <p role="status">Caricamento delle convenzioni…</p>
          : offers.isError ? <p role="alert">Elenco temporaneamente non disponibile. <button className="underline" onClick={()=>offers.refetch()}>Riprova</button></p>
          : offers.data.length ? <div className="grid gap-5 md:grid-cols-2">{offers.data.map(offer =>
            <article key={offer.id} className="space-y-4 break-words border bg-card p-6">
              <h3 className="font-headline text-3xl">{offer.business}</h3>
              <p className="whitespace-pre-line">{offer.benefit}</p>
              <dl className="space-y-3">
                {offer.conditions && <div><dt className="font-semibold">Condizioni e validità</dt><dd className="whitespace-pre-line">{offer.conditions}</dd></div>}
                <div><dt className="font-semibold">Come usufruirne</dt><dd className="whitespace-pre-line">{offer.redemption}</dd></div>
              </dl>
            </article>
          )}</div> : <p className="text-muted-foreground">Al momento non ci sono convenzioni pubblicate.</p>}
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
