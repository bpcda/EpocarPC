import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { eventPhase, formatEventDate, splitEvents } from "@/lib/event-time";
import type { Tables } from "@/integrations/supabase/types";
import { safeHref } from "@/lib/cms";

type EventData = Pick<Tables<"events">, "id" | "title" | "description" | "date" | "end_date" | "location" | "image_url" | "registration_link" | "registration_enabled">;

export default function EventiPage() {
  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["events", "published"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.from("events")
        .select("id, title, description, date, end_date, location, image_url, registration_link, registration_enabled")
        .eq("published", true).order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
  });
  const { upcoming, past } = splitEvents(events);

  return (
    <>
      <PageMeta title="Eventi e raduni — Epocar Piacenza" description="Calendario di raduni, mostre e uscite dedicate ad auto, moto e Vespa d'epoca organizzati dalla community Epocar a Piacenza e dintorni." path="/eventi" />
      <Helmet><script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@graph": events.filter(e => e.date).map(e => ({
          "@type": "Event", name: e.title, startDate: e.date, endDate: e.end_date ?? undefined,
          description: e.description ?? undefined, image: e.image_url ?? undefined,
          eventStatus: "https://schema.org/EventScheduled",
          location: e.location ? { "@type": "Place", name: e.location, address: e.location } : undefined,
          organizer: { "@type": "Organization", name: "Epocar" },
        })),
      })}</script></Helmet>
      <Navbar />
      <main>
        <section className="bg-foreground text-primary-foreground pt-32 pb-16 lg:pt-40 lg:pb-20" aria-labelledby="events-title">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <p className="text-xs uppercase tracking-[0.2em] mb-6">Incontriamoci a Piacenza</p>
            <h1 id="events-title" className="font-headline text-6xl md:text-8xl lg:text-9xl leading-none tracking-wide mb-6">EVENTI</h1>
            <p className="max-w-xl text-primary-foreground/85 leading-relaxed mb-12">I prossimi appuntamenti e i ricordi dei giri già fatti insieme.</p>
            {isLoading ? <p role="status">Caricamento del calendario…</p>
              : isError ? <div role="alert"><p className="mb-4">Il calendario non è disponibile in questo momento.</p><Button variant="hero-secondary" onClick={() => refetch()}>Riprova</Button></div>
              : <>
                <h2 className="font-headline text-3xl md:text-4xl tracking-wide mb-8">Prossimi eventi</h2>
                {upcoming.length ? <div className="space-y-12">{upcoming.map(e => <EventRow key={e.id} event={e} />)}</div>
                  : <p className="text-primary-foreground/85">Stiamo preparando il prossimo raduno. Nel frattempo scopri gli incontri passati.</p>}
              </>}
          </div>
        </section>
        {past.length > 0 && <section className="bg-background text-foreground py-16 lg:py-20" aria-labelledby="past-events">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <h2 id="past-events" className="font-headline text-4xl md:text-5xl tracking-wide mb-10">Ci siamo incontrati qui</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">{past.map(e => <EventRow key={e.id} event={e} past />)}</div>
          </div>
        </section>}
      </main>
      <Footer />
    </>
  );
}

function EventRow({ event, past = false }: { event: EventData; past?: boolean }) {
  const registrationLink = safeHref(event.registration_link);
  return (
    <article id={`evento-${event.id}`} className={`scroll-mt-28 ${past ? "border-t border-border pt-5" : "grid lg:grid-cols-2 gap-8 lg:gap-12 items-center"}`}>
      {event.image_url && <div className={`relative overflow-hidden ${past ? "h-56 bg-secondary mb-5" : "h-80 lg:h-[420px] bg-primary-foreground/5"}`}>
        <img src={event.image_url} alt={`Locandina: ${event.title}`} className="w-full h-full object-contain" loading="lazy" />
      </div>}
      <div className="space-y-4">
        {!past && eventPhase(event) === "current" && <p className="text-xs uppercase tracking-widest">In corso</p>}
        <h3 className={`font-headline tracking-wide leading-tight break-words ${past ? "text-3xl" : "text-3xl md:text-5xl"}`}>{event.title}</h3>
        {event.date && <p className="text-sm leading-relaxed opacity-85">{formatEventDate(event, !past)}</p>}
        {event.location && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="block text-sm underline underline-offset-4 leading-relaxed">
          <span className="line-clamp-2">{event.location}</span><span className="inline-block mt-1">Apri la mappa ↗</span>
        </a>}
        {event.description && (past ? <details className="text-sm"><summary className="cursor-pointer py-3 underline underline-offset-4">Leggi il racconto</summary><p className="leading-relaxed whitespace-pre-line mt-2">{event.description}</p></details>
          : <p className="text-sm leading-relaxed whitespace-pre-line text-primary-foreground/85">{event.description}</p>)}
        {!past && (event.registration_enabled ? <Button variant="hero-primary" asChild><Link to={`/eventi/${event.id}/iscrizione`}>Iscriviti all’evento</Link></Button>
          : registrationLink ? <Button variant="hero-primary" asChild><a href={registrationLink} target="_blank" rel="noopener noreferrer">Prenota ↗</a></Button> : null)}
      </div>
    </article>
  );
}
