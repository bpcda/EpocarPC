import { useState, useEffect } from "react";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { supabase } from "@/integrations/supabase/client";
import eventRitrovo from "@/assets/event-ritrovo.jpg";
import eventVespa from "@/assets/event-vespa.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";

const fallbackEvents = [
  {
    id: "fallback-1",
    title: "Il Ritrovo Della Domenica",
    description: "Incontro mensile dove gli appassionati portano le proprie auto d'epoca, moto storiche o Vespa per condividere storie, parlare di restauri e conoscere altri entusiasti.",
    image_url: null,
    fallbackImage: eventRitrovo,
  },
  {
    id: "fallback-2",
    title: "Vespa Groove Night",
    description: "Un evento culturale che unisce la cultura Vespa, storytelling, aperitivo e DJ set. Talk, workshop, aperitivo, musica e DJ set.",
    image_url: null,
    fallbackImage: eventVespa,
  },
  {
    id: "fallback-3",
    title: "Community Meetups",
    description: "Futuri eventi, road trip e raduni per esplorare insieme le strade più belle d'Italia a bordo dei nostri veicoli storici.",
    image_url: null,
    fallbackImage: eventMeetup,
  },
];

interface EventDisplay {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  fallbackImage?: string;
}

function EventCard({ event }: { event: EventDisplay }) {
  const [hovered, setHovered] = useState(false);
  const imageSrc = event.image_url || event.fallbackImage;

  return (
    <div
      className="relative h-[400px] lg:h-[500px] bg-foreground cursor-pointer overflow-hidden transition-transform duration-500"
      style={{
        transform: hovered ? "scale(0.98) perspective(1000px) rotateX(1deg)" : "scale(1)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt={event.title}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            hovered ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
        />
      )}
      {hovered && <div className="absolute inset-0 bg-foreground/40" />}

      <div className="relative z-10 flex flex-col justify-end h-full p-8">
        <h3 className="font-headline text-2xl lg:text-3xl text-background leading-tight mb-3">
          {event.title}
        </h3>
        <p className={`text-sm text-background/70 max-w-sm transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}>
          {event.description}
        </p>
      </div>
    </div>
  );
}

export default function EventiSection() {
  const ref = useScrollReveal();
  const [events, setEvents] = useState<EventDisplay[]>(fallbackEvents);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, description, image_url")
        .eq("published", true)
        .order("date", { ascending: true })
        .limit(3);

      if (data && data.length > 0) {
        setEvents(data);
      }
    };
    fetchEvents();
  }, []);

  return (
    <section className="py-24 lg:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal mb-16">
          <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Eventi</p>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl text-foreground">
            Eventi Epocar
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 section-reveal" style={{ transitionDelay: "0.2s" }}>
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  );
}
