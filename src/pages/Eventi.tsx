import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import eventRitrovo from "@/assets/event-ritrovo.jpg";
import eventVespa from "@/assets/event-vespa.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";

const events = [
  {
    title: "Il Ritrovo Della Domenica",
    description: "Incontro mensile dove gli appassionati portano le proprie auto d'epoca, moto storiche o Vespa per condividere storie, parlare di restauri e conoscere altri entusiasti.",
    details: ["Ogni prima domenica del mese", "Piacenza, Piazza Cavalli", "Ore 10:00 — 13:00"],
    image: eventRitrovo,
  },
  {
    title: "Vespa Groove Night",
    description: "Un evento culturale che unisce la cultura Vespa, storytelling, aperitivo e DJ set.",
    details: ["Talk & Workshop", "Aperitivo", "Musica & DJ Set"],
    image: eventVespa,
  },
  {
    title: "Community Meetups",
    description: "Futuri eventi, road trip e raduni per esplorare insieme le strade più belle d'Italia a bordo dei nostri veicoli storici.",
    details: ["Road trip", "Raduni", "Esperienze su strada"],
    image: eventMeetup,
  },
];

export default function EventiPage() {
  const ref = useScrollReveal();

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
              <div key={event.title} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? "lg:direction-rtl" : ""}`}>
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <img src={event.image} alt={event.title} className="w-full h-[400px] object-cover" loading="lazy" />
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                  <h2 className="font-headline text-3xl md:text-4xl text-foreground mb-4">{event.title}</h2>
                  <p className="text-base text-muted-foreground leading-relaxed mb-6">{event.description}</p>
                  <ul className="space-y-2">
                    {event.details.map((d) => (
                      <li key={d} className="text-sm text-foreground/70 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                        {d}
                      </li>
                    ))}
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
