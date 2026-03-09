import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import rubricar1 from "@/assets/rubricar-1.jpg";
import rubricar2 from "@/assets/rubricar-2.jpg";
import rubricar3 from "@/assets/rubricar-3.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";
import eventRitrovo from "@/assets/event-ritrovo.jpg";
import eventVespa from "@/assets/event-vespa.jpg";

const articles = [
  { title: "Concorso d'Eleganza — Villa d'Este", location: "Como", date: "Maggio 2025", image: rubricar1 },
  { title: "Vespa Raduno — Pontenure", location: "Piacenza", date: "Giugno 2025", image: rubricar2 },
  { title: "Fiat 500 al Borgo", location: "Bobbio", date: "Luglio 2025", image: rubricar3 },
  { title: "Gran Premio Storico", location: "Monza", date: "Settembre 2025", image: eventMeetup },
  { title: "Raduno d'Autunno", location: "Piacenza", date: "Ottobre 2025", image: eventRitrovo },
  { title: "Vespa Groove Night — Edizione Speciale", location: "Piacenza", date: "Novembre 2025", image: eventVespa },
];

export default function RubricarPage() {
  const ref = useScrollReveal();

  return (
    <>
      <Navbar />
      <main>
        <section className="bg-foreground pt-32 pb-24 lg:pt-40 lg:pb-32" ref={ref}>
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="section-reveal mb-12">
              <h1 className="font-headline text-6xl md:text-8xl lg:text-9xl text-primary-foreground leading-none tracking-wider">
                RUBRICAR
              </h1>
              <div className="w-24 h-0.5 bg-primary-foreground/30 mt-4" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 section-reveal" style={{ transitionDelay: "0.2s" }}>
              <div className="md:col-span-7 h-[500px] group relative overflow-hidden cursor-pointer">
                <img src={articles[0].image} alt={articles[0].title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6">
                  <p className="font-headline text-xs tracking-[0.2em] text-primary-foreground/50 mb-1">{articles[0].location} — {articles[0].date}</p>
                  <h3 className="font-headline text-2xl text-primary-foreground tracking-wider">{articles[0].title.toUpperCase()}</h3>
                </div>
              </div>
              <div className="md:col-span-5 flex flex-col gap-3">
                {articles.slice(1, 3).map((a) => (
                  <div key={a.title} className="h-[244px] group relative overflow-hidden cursor-pointer">
                    <img src={a.image} alt={a.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-6">
                      <p className="font-headline text-xs tracking-[0.2em] text-primary-foreground/50 mb-1">{a.location} — {a.date}</p>
                      <h3 className="font-headline text-lg text-primary-foreground tracking-wider">{a.title.toUpperCase()}</h3>
                    </div>
                  </div>
                ))}
              </div>
              {articles.slice(3).map((a) => (
                <div key={a.title} className="md:col-span-4 h-[300px] group relative overflow-hidden cursor-pointer">
                  <img src={a.image} alt={a.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <p className="font-headline text-xs tracking-[0.2em] text-primary-foreground/50 mb-1">{a.location} — {a.date}</p>
                    <h3 className="font-headline text-lg text-primary-foreground tracking-wider">{a.title.toUpperCase()}</h3>
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
