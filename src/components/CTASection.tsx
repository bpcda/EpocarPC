import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import heroImage from "@/assets/hero-car.jpg";

export default function CTASection() {
  const ref = useScrollReveal();

  return (
    <section className="relative py-32 lg:py-40 overflow-hidden" ref={ref}>
      <img
        src={heroImage}
        alt="Join Epocar"
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-foreground/60" />
      <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center section-reveal">
        <h2 className="font-headline text-3xl md:text-5xl lg:text-6xl text-background leading-tight mb-6">
          Unisciti Alla Community Epocar
        </h2>
        <p className="text-base md:text-lg text-background/70 max-w-xl mx-auto mb-10">
          Entra a far parte della nuova generazione di appassionati di motori storici.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="accent" size="lg" asChild>
            <a href="https://instagram.com/epocar" target="_blank" rel="noopener noreferrer">
              Segui Su Instagram
            </a>
          </Button>
          <Button variant="hero-secondary" asChild>
            <Link to="/eventi">Partecipa Al Prossimo Evento</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
