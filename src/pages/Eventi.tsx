import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { Button } from "@/components/ui/button";
import eventRitrovo from "@/assets/event-ritrovo.jpg";
import eventVespa from "@/assets/event-vespa.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";
import { useNavigate } from "react-router-dom";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  location: string | null;
  image_url: string | null;
  category: string | null;
  registration_link?: string | null;
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
    description: "Un evento culturale che unisce la cultura Vespa, storytelling, aperitivo e DJ set",
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
  let navigate = useNavigate();

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("events")
          .select("id, title, description, date, location, image_url, registration_link, category")
          .eq("published", true)
          .order("date", { ascending: true });

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
    <>
      <Navbar />
      <main>
        {/* Hero header */}
        <section className="bg-foreground pt-32 pb-16 lg:pt-40 lg:pb-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8" ref={ref}>
            <div className="section-reveal">
              <h1 className="font-headline text-6xl md:text-8xl lg:text-9xl text-primary-foreground leading-none tracking-wider">
                EVENTI
              </h1>
              <div className="w-24 h-0.5 bg-primary-foreground/30 mt-4" />
            </div>

            {/* Thumbnail row 
            <div className="grid grid-cols-3 gap-3 mt-12 section-reveal" style={{ transitionDelay: "0.1s" }}>
              {events.slice(0, 3).map((event) => (
                <div key={event.id} className="relative aspect-[4/5] overflow-hidden cursor-pointer group">
                  {event.image_url && (
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/10 transition-colors duration-300" />
                </div>
              ))}
            </div>*/}
          </div>
        </section>

        {/* Event details */}
        <section className="bg-foreground pb-24 lg:pb-32">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="space-y-20">
              {events.map((event, i) => (
                <div key={event.id} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center`}>
                  <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                    {event.image_url ? (
                      <img src={event.image_url} alt={event.title} className="w-full h-[350px] lg:h-[450px] object-cover" loading="lazy" onClick={()=> navigate("/eventi")}/>
                    ) : (
                      <div className="w-full h-[350px] lg:h-[450px] bg-primary-foreground/5 flex items-center justify-center" onClick={()=> navigate("/eventi")}>
                        <span className="text-primary-foreground/30 text-sm">Nessuna immagine</span>
                      </div>
                    )}
                  </div>
                  <div className={`${i % 2 === 1 ? "lg:order-1" : ""} space-y-4`}>
                    <h2 className="font-headline text-3xl md:text-5xl text-primary-foreground tracking-wider leading-none">
                      {event.title.toUpperCase()}
                    </h2>
                    <div className="flex gap-8">
                      {event.date && (
                        <div>
                          <p className="font-headline text-sm tracking-widest text-primary-foreground/40">DATA</p>
                          <p className="text-primary-foreground/70 text-sm">
                            {new Date(event.date).toLocaleDateString("it-IT", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      )}
                      {event.location && (
                        <div>
                          <p className="font-headline text-sm tracking-widest text-primary-foreground/40">LUOGO</p>
                          <p className="text-primary-foreground/70 text-sm">{event.location}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-primary-foreground/60 text-sm leading-relaxed">{event.description}</p>
                    <Button
                      variant="outline"
                      className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-headline tracking-widest"
                      onClick={() => window.open(event.registration_link)}
                    >
                      PRENOTAZIONE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
