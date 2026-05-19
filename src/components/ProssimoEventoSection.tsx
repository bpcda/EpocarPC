import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { CalendarDays, MapPin } from "lucide-react";
import eventRitrovo from "@/assets/event-ritrovo.jpg";

interface NextEvent {
  title: string;
  date: string | null;
  location: string | null;
  description: string | null;
  image_url: string | null;
}

const fallback: NextEvent = {
  title: "Il Ritrovo Della Domenica",
  date: "2025-06-15",
  location: "Piacenza",
  description: "Raduno mensile per appassionati di auto, moto e Vespa d'epoca. Un'occasione per condividere la passione e scoprire veicoli unici.",
  image_url: null,
};

export default function ProssimoEventoSection() {
  const ref = useScrollReveal();
  const [event, setEvent] = useState<NextEvent>(fallback);

  useEffect(() => {
    const fetchNext = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("events")
          .select("title, date, location, description, image_url")
          .eq("published", true)
          .gte("date", new Date().toISOString().split("T")[0])
          .order("date", { ascending: true })
          .limit(1);
        if (data && data.length > 0) setEvent(data[0]);
      } catch {
        // Backend unavailable — keep fallback
      }
    };
    fetchNext();
  }, []);

  const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  };

  const imageSrc = event.image_url || eventRitrovo;

  return (
    <section className="relative py-24 lg:py-32 overflow-hidden bg-foreground" ref={ref}>
      {/* Blurred backdrop fills the section; the poster itself is never cropped */}
      <img
        src={imageSrc}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-foreground/70" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center section-reveal">
        <div className="order-2 lg:order-1">
        <p className="font-headline text-sm tracking-[0.2em] text-primary-foreground/50 mb-6">
          PROSSIMO EVENTO
        </p>
        <h2 className="font-headline text-4xl md:text-6xl lg:text-7xl text-primary-foreground leading-none tracking-wider mb-6">
          {event.title.toUpperCase()}
        </h2>
        <div className="flex flex-wrap gap-6 mb-6">
          {event.location && (
            <span className="flex items-center gap-2 text-primary-foreground/80 text-sm">
              <MapPin className="w-4 h-4" />
              {event.location}
            </span>
          )}
          {event.date && (
            <span className="flex items-center gap-2 text-primary-foreground/80 text-sm">
              <CalendarDays className="w-4 h-4" />
              {formatDate(event.date)}
            </span>
          )}
        </div>
        <p className="text-base md:text-lg text-primary-foreground/70 max-w-xl mb-10">
          {event.description}
        </p>
        <Button variant="hero-primary" asChild>
          <Link to="/eventi">Partecipa All'Evento</Link>
        </Button>
        </div>
        <div className="order-1 lg:order-2 flex justify-center">
          <img
            src={imageSrc}
            alt={event.title}
            className="w-full max-h-[60vh] object-contain"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
