import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import rubricar1 from "@/assets/rubricar-1.jpg";
import rubricar2 from "@/assets/rubricar-2.jpg";
import rubricar3 from "@/assets/rubricar-3.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";

const articles = [
  { title: "Concorso d'Eleganza — Villa d'Este", location: "Como, Italia", date: "Maggio 2025", image: rubricar1 },
  { title: "Vespa Raduno — Pontenure", location: "Piacenza, Italia", date: "Giugno 2025", image: rubricar2 },
  { title: "Fiat 500 al Borgo", location: "Bobbio, Italia", date: "Luglio 2025", image: rubricar3 },
  { title: "Gran Premio Storico — Autodromo di Monza", location: "Monza, Italia", date: "Settembre 2025", image: eventMeetup },
];

export default function RubricarSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal mb-12">
          <h2 className="font-headline text-5xl md:text-7xl lg:text-8xl text-foreground tracking-wider">
            RUBRICAR
          </h2>
          <div className="w-24 h-0.5 bg-foreground/30 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 section-reveal" style={{ transitionDelay: "0.2s" }}>
          <div className="md:col-span-7">
            <ArticleCard article={articles[0]} tall />
          </div>
          <div className="md:col-span-5 flex flex-col gap-3">
            <ArticleCard article={articles[1]} />
            <ArticleCard article={articles[2]} />
          </div>
          <div className="md:col-span-12">
            <ArticleCard article={articles[3]} wide />
          </div>
        </div>
      </div>
    </section>
  );
}

function ArticleCard({ article, tall, wide }: { article: typeof articles[0]; tall?: boolean; wide?: boolean }) {
  return (
    <div className={`group relative overflow-hidden cursor-pointer ${tall ? "h-[500px]" : wide ? "h-[300px]" : "h-[244px]"}`}>
      <img
        src={article.image}
        alt={article.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
      <div className="absolute bottom-0 left-0 p-6">
        <p className="font-headline text-xs tracking-[0.2em] text-primary-foreground/50 mb-1">
          {article.location} — {article.date}
        </p>
        <h3 className="font-headline text-lg lg:text-xl text-primary-foreground tracking-wider leading-snug">
          {article.title.toUpperCase()}
        </h3>
      </div>
    </div>
  );
}
