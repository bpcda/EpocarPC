import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { socialUrl } from "@/lib/benefit-media";
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
          : offers.data.length ? <ul className="divide-y border-y" aria-label="Convenzioni pubblicate">{offers.data.map(offer =>
            <li key={offer.id}>
              <details className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[3rem_minmax(0,1fr)_1.5rem] items-center gap-3 py-4 sm:grid-cols-[5rem_minmax(0,1fr)_1.5rem] sm:gap-6 sm:py-5 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                  <span className="flex h-12 items-center justify-center sm:h-16">
                    {offer.logo ? <img className="max-h-full max-w-full object-contain" alt="" src={offer.logo} loading="lazy" />
                      : <span aria-hidden="true" className="font-headline text-2xl text-muted-foreground">{offer.business.trim().slice(0,1).toUpperCase()}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-headline text-2xl leading-tight group-open:whitespace-normal group-open:break-words sm:text-3xl">{offer.business}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground group-open:hidden">{offer.benefit}</span>
                  </span>
                  <ChevronDown aria-hidden="true" className="h-5 w-5 group-open:rotate-180" />
                </summary>
                <div className="min-w-0 space-y-4 break-words pb-6 sm:pl-[6.5rem]">
                  <p className="whitespace-pre-line">{offer.benefit}</p>
              <dl className="space-y-3">
                {offer.conditions && <div><dt className="font-semibold">Condizioni e validità</dt><dd className="whitespace-pre-line">{offer.conditions}</dd></div>}
                <div><dt className="font-semibold">Come usufruirne</dt><dd className="whitespace-pre-line">{offer.redemption}</dd></div>
              </dl>
              {offer.social_links?.length ? <ul aria-label={`Profili social di ${offer.business}`} className="flex flex-wrap gap-x-4 gap-y-2">
                {offer.social_links.map(link=>{
                  const url = socialUrl(link);
                  return url && <li key={link}><a href={url.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {url.hostname.replace(/^www\./,"")}{url.pathname.replace(/\/$/,"")}
                  </a></li>;
                })}
              </ul> : null}
                </div>
              </details>
            </li>
          )}</ul> : <p className="text-muted-foreground">Al momento non ci sono convenzioni pubblicate.</p>}
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
