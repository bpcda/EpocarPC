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
        alt="Unisciti alla community Epocar"
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-foreground/70" />
      <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center section-reveal">
        <h2 className="font-headline text-4xl md:text-6xl lg:text-8xl text-primary-foreground leading-none tracking-wider mb-6">
          UNISCITI A EPOCAR
        </h2>
        <div className="w-24 h-0.5 bg-primary-foreground/40 mx-auto mb-6" />
        <p className="text-base md:text-lg text-primary-foreground/70 max-w-xl mx-auto mb-10">
          Entra a far parte della nuova generazione di appassionati di motori storici.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="hero-primary" asChild>
            <Link to="/eventi">Scopri Gli Eventi</Link>
          </Button>
          <Button variant="hero-secondary" asChild>
            <a href="https://instagram.com/epocar.official" target="_blank" rel="noopener noreferrer">
              Segui Su Instagram
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
