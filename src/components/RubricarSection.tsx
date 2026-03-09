import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import rubricar1 from "@/assets/rubricar-1.jpg";
import rubricar2 from "@/assets/rubricar-2.jpg";
import rubricar3 from "@/assets/rubricar-3.jpg";
import eventMeetup from "@/assets/event-meetup.jpg";

const articles = [
  {
    title: "Concorso d'Eleganza — Villa d'Este",
    location: "Como, Italia",
    date: "Maggio 2025",
    image: rubricar1,
    size: "large",
  },
  {
    title: "Vespa Raduno — Pontenure",
    location: "Piacenza, Italia",
    date: "Giugno 2025",
    image: rubricar2,
    size: "small",
  },
  {
    title: "Fiat 500 al Borgo",
    location: "Bobbio, Italia",
    date: "Luglio 2025",
    image: rubricar3,
    size: "small",
  },
  {
    title: "Gran Premio Storico — Autodromo di Monza",
    location: "Monza, Italia",
    date: "Settembre 2025",
    image: eventMeetup,
    size: "large",
  },
];

export default function RubricarSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-secondary" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal mb-16">
          <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Rubricar</p>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl text-foreground">
            Storie Di Motori
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 section-reveal" style={{ transitionDelay: "0.2s" }}>
          {/* Asymmetric masonry layout */}
          <div className="md:col-span-7">
            <ArticleCard article={articles[0]} tall />
          </div>
          <div className="md:col-span-5 flex flex-col gap-4">
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
    <div className={`group relative overflow-hidden cursor-pointer ${tall ? "h-[500px]" : wide ? "h-[300px]" : "h-[240px]"}`}>
      <img
        src={article.image}
        alt={article.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
      <div className="absolute bottom-0 left-0 p-6">
        <p className="text-xs font-body tracking-widest text-background/60 uppercase mb-1">
          {article.location} — {article.date}
        </p>
        <h3 className="font-headline text-lg lg:text-xl text-background leading-snug">
          {article.title}
        </h3>
      </div>
    </div>
  );
}
