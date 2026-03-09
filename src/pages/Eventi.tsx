import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { supabase } from "@/integrations/supabase/client";
import eventRitrovo from "@/assets/event-ritrovo.jpg";
import eventVespa from "@/assets/event-vespa.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  location: string | null;
  image_url: string | null;
  category: string | null;
}

const fallbackEvents: EventData[] = [
  {
    id: "fallback-1",
    title: "Il Ritrovo Della Domenica",
    description: "Incontro mensile dove gli appassionati portano le proprie auto d'epoca, moto storiche o Vespa per condividere storie, parlare di restauri e conoscere altri entusiasti.",
    date: null,
    location: "Piacenza, Piazza Cavalli",
    image_url: eventRitrovo,
    category: "event",
  },
  {
    id: "fallback-2",
    title: "Vespa Groove Night",
    description: "Un evento culturale che unisce la cultura Vespa, storytelling, aperitivo e DJ set.",
    date: null,
    location: null,
    image_url: eventVespa,
    category: "event",
  },
  {
    id: "fallback-3",
    title: "Community Meetups",
    description: "Futuri eventi, road trip e raduni per esplorare insieme le strade più belle d'Italia a bordo dei nostri veicoli storici.",
    date: null,
    location: null,
    image_url: eventMeetup,
    category: "event",
  },
];

export default function EventiPage() {
  const ref = useScrollReveal();
  const [events, setEvents] = useState<EventData[]>(fallbackEvents);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, description, date, location, image_url, category")
        .eq("published", true)
        .order("date", { ascending: true });

      if (data && data.length > 0) {
        setEvents(data);
      }
    };
    fetchEvents();
  }, []);

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24" ref={ref}>
          <div className="section-reveal mb-16">
            <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Eventi</p>
            <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl text-foreground">
              I Nostri Eventi
            </h1>
          </div>
          <div className="space-y-24 section-reveal" style={{ transitionDelay: "0.2s" }}>
            {events.map((event, i) => (
              <div key={event.id} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center`}>
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  {event.image_url ? (
                    <img src={event.image_url} alt={event.title} className="w-full h-[400px] object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-[400px] bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground text-sm">Nessuna immagine</span>
                    </div>
                  )}
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                  <h2 className="font-headline text-3xl md:text-4xl text-foreground mb-4">{event.title}</h2>
                  <p className="text-base text-muted-foreground leading-relaxed mb-6">{event.description}</p>
                  <ul className="space-y-2">
                    {event.date && (
                      <li className="text-sm text-foreground/70 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                        {new Date(event.date).toLocaleDateString("it-IT", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </li>
                    )}
                    {event.location && (
                      <li className="text-sm text-foreground/70 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground transition-colors"
                        >
                          {event.location}
                        </a>
                      </li>
                    )}
                    {event.category && event.category !== "event" && (
                      <li className="text-sm text-foreground/70 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                        {event.category}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
