import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countdownState, formatEventDate, type TimedEvent } from "@/lib/event-time";

export interface CountdownEvent extends TimedEvent {
  id: string;
  title: string;
  location: string | null;
  show_homepage_countdown: boolean;
}

const z = (n: number) => String(n).padStart(2, "0");

/** Only this component ticks every second; it disappears by itself once the event is over. */
export default function HomepageCountdown({ event }: { event: CountdownEvent }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const state = countdownState(event, now);
  if (!state) return null;
  const units: [number, string][] = [[state.days, "giorni"], [state.hours, "ore"], [state.minutes, "min"], [state.seconds, "sec"]];

  return (
    <section className="bg-foreground border-y border-primary-foreground/15 py-16 lg:py-20" aria-labelledby="countdown-title">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-[1fr_auto] gap-10 items-end">
        <div>
          <p className="font-headline text-sm tracking-[0.2em] text-primary-foreground/50 mb-4">{state.phase === "current" ? "EVENTO IN CORSO" : "MANCANO"}</p>
          <h2 id="countdown-title" className="font-headline text-4xl md:text-6xl text-primary-foreground tracking-wider leading-none mb-5">{event.title.toUpperCase()}</h2>
          <div className="flex flex-wrap gap-6 text-sm text-primary-foreground/80">
            <span className="flex items-center gap-2"><CalendarDays className="w-4 h-4" />{formatEventDate(event, true)}</span>
            {event.location && <span className="flex items-center gap-2"><MapPin className="w-4 h-4" />{event.location}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:items-end">
          {state.phase === "upcoming" && (
            <>
              <p className="sr-only">Conto alla rovescia fino all'inizio dell'evento, il {formatEventDate(event, true)}.</p>
              <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
                {units.map(([v, l]) => (
                  <div key={l} className="border border-primary-foreground/30 px-3 py-3 sm:px-5 sm:py-4 text-center min-w-[4.5rem] sm:min-w-[6rem]">
                    <span className="block font-headline text-4xl sm:text-6xl text-primary-foreground tabular-nums leading-none">{l === "giorni" ? v : z(v)}</span>
                    <span className="block text-[10px] sm:text-xs uppercase tracking-widest text-primary-foreground/60 mt-2">{l}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <Button variant="hero-primary" asChild>
            <Link to={`/eventi#evento-${event.id}`}>Scopri l'evento</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
