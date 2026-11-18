import { useEffect, useState } from "react";
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
    <div className="mb-8">
      <p className="text-xs uppercase tracking-[0.2em] mb-4">{state.phase === "current" ? "Evento in corso" : "Mancano"}</p>
      {state.phase === "upcoming" && (
        <>
          <p className="sr-only">Conto alla rovescia fino all'inizio dell'evento, il {formatEventDate(event, true)}.</p>
          <div className="grid grid-cols-4 gap-2 max-w-sm" aria-hidden="true">
            {units.map(([v, l]) => (
              <div key={l} className="border border-primary-foreground/30 px-2 py-3 text-center">
                <span className="block font-headline text-3xl sm:text-4xl text-primary-foreground tabular-nums leading-none">{l === "giorni" ? v : z(v)}</span>
                <span className="block text-xs uppercase tracking-wide text-primary-foreground/80 mt-2">{l}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
