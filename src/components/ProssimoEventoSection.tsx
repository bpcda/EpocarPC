import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import HomepageCountdown from "@/components/HomepageCountdown";
import { countdownState, eventPhase, formatEventDate } from "@/lib/event-time";

export default function ProssimoEventoSection() {
  const { data: event, isLoading, isError } = useQuery({
    queryKey: ["events", "homepage"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.from("events")
        .select("id, title, date, end_date, location, published, show_homepage_countdown, image_url")
        .eq("published", true)
        .or(`end_date.gte.${new Date().toISOString()},date.gte.${new Date(Date.now() - 2 * 86400000).toISOString()}`)
        .order("date", { ascending: true });
      if (error) throw error;
      return data?.find(e => countdownState(e))
        ?? data?.find(e => ["upcoming", "current"].includes(eventPhase(e)))
        ?? null;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  if (!event) return (
    <section className="bg-background text-foreground py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <h2 className="font-headline text-3xl tracking-wide mb-3">Il prossimo incontro</h2>
        <p className="text-muted-foreground mb-4" role="status">{isLoading ? "Stiamo cercando il prossimo appuntamento…" : isError ? "Il calendario non è disponibile in questo momento." : "Stiamo preparando il prossimo raduno. Scopri le nostre iniziative e gli incontri passati."}</p>
        <Link to="/eventi" className="inline-flex items-center min-h-11 text-sm underline underline-offset-4">Vai agli eventi →</Link>
      </div>
    </section>
  );

  return (
    <section className="bg-foreground text-primary-foreground py-12 lg:py-16" aria-labelledby="next-event-title">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] mb-5">Il prossimo incontro</p>
          <h2 id="next-event-title" className="font-headline text-4xl md:text-5xl lg:text-6xl tracking-wide leading-tight mb-6">{event.title}</h2>
          <p className="flex items-start gap-3 text-sm leading-relaxed mb-4"><CalendarDays className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" />{formatEventDate(event, true)}</p>
          {event.location && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 text-sm leading-relaxed mb-6 underline underline-offset-4"><MapPin className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" />{event.location}</a>}
          <HomepageCountdown event={event} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <Button variant="hero-primary" size="lg" asChild><Link to={`/eventi#evento-${event.id}`}>Scopri l’evento</Link></Button>
            <Link to="/eventi" className="inline-flex items-center min-h-11 text-sm underline underline-offset-4">Tutti gli eventi →</Link>
          </div>
        </div>
        {event.image_url && <img src={event.image_url} alt={`Locandina: ${event.title}`} className="w-full max-h-[440px] object-contain" loading="lazy" />}
      </div>
    </section>
  );
}
