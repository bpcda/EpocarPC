import { useState, useEffect } from "react";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import eventRitrovo from "@/assets/event-ritrovo.jpg";
import eventVespa from "@/assets/event-vespa.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";

const fallbackEvents = [
  {
    id: "fallback-1",
    title: "Al Ritrovo Della Domenica",
    description: "Incontro mensile dove gli appassionati portano le proprie auto d'epoca, moto storiche o Vespa.",
    date: null as string | null,
    location: "Piacenza" as string | null,
    image_url: null as string | null,
    fallbackImage: eventRitrovo,
  },
  {
    id: "fallback-2",
    title: "Vespa Groove Night",
    description: "Un evento culturale che unisce la cultura Vespa, storytelling, aperitivo e DJ set.",
    date: null as string | null,
    location: null as string | null,
    image_url: null as string | null,
    fallbackImage: eventVespa,
  },
  {
    id: "fallback-3",
    title: "Community Meetups",
    description: "Futuri eventi, road trip e raduni per esplorare insieme le strade più belle d'Italia.",
    date: null as string | null,
    location: null as string | null,
    image_url: null as string | null,
    fallbackImage: eventMeetup,
  },
];

interface EventDisplay {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  location: string | null;
  image_url: string | null;
  registration_link?: string | null;
  fallbackImage?: string;
}

export default function EventiSection() {
  const ref = useScrollReveal();
  const [events, setEvents] = useState<EventDisplay[]>(fallbackEvents);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("events")
          .select("id, image_url")
          .eq("published", true)
          .order("date", { ascending: true })
          .limit(3);

        if (data && data.length > 0) {
          setEvents(data);
        }
      } catch {
        // Backend unavailable — keep fallback data
      }
    };
    fetchEvents();
  }, []);

  return (
    <section className="py-24 lg:py-32 bg-foreground" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal mb-12">
          <h2 className="font-headline text-5xl md:text-7xl lg:text-8xl text-primary-foreground tracking-wider">
            EVENTI
          </h2>
          <div className="w-24 h-0.5 bg-primary-foreground/30 mt-2" />
        </div>

        {/* Thumbnail row */}
        <div className="grid grid-cols-3 gap-3 mb-16 section-reveal" style={{ transitionDelay: "0.1s" }}>
          {events.map((event) => {
            const img = event.image_url || event.fallbackImage;
            return (
              <div key={event.id} className="relative aspect-[4/5] overflow-hidden cursor-pointer group">
                {img && (
                  <img
                    src={img}
                    alt={event.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-foreground/30 group-hover:bg-foreground/10 transition-colors duration-300" />
              </div>
            );
          })}
        </div>

        {/* Event details alternating 
        <div className="space-y-16 section-reveal" style={{ transitionDelay: "0.2s" }}>
          {events.map((event, i) => {
            const img = event.image_url || event.fallbackImage;
            return (
              <div key={event.id} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center`}>
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  {img && (
                    <img src={img} alt={event.title} className="w-full h-[350px] lg:h-[450px] object-cover" loading="lazy" />
                  )}
                </div>
                <div className={`${i % 2 === 1 ? "lg:order-1" : ""} space-y-4`}>
                  <h3 className="font-headline text-3xl md:text-4xl text-primary-foreground tracking-wider">
                    {event.title}
                  </h3>
                  <div className="flex gap-8">
                    {event.date && (
                      <div>
                        <p className="font-headline text-sm tracking-widest text-primary-foreground/50">DATA</p>
                        <p className="text-primary-foreground/80 text-sm">{new Date(event.date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
                      </div>
                    )}
                    {event.location && (
                      <div>
                        <p className="font-headline text-sm tracking-widest text-primary-foreground/50">LUOGO</p>
                        <p className="text-primary-foreground/80 text-sm">{event.location}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-primary-foreground/70 text-sm leading-relaxed">{event.description}</p>
                  <Button variant="outline" size="default" className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-headline tracking-widest" asChild>
                    <Link to="/eventi">PRENOTAZIONE</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>*/}
      </div>
    </section>
  );
}
