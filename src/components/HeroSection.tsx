import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import heroImage from "@/assets/hero-car.jpg";

export default function HeroSection() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <img
        src={heroImage}
        alt="Classic car in Italian piazza"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-foreground/50" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
        <h1 className="font-headline text-4xl md:text-6xl lg:text-7xl text-accent-foreground max-w-4xl leading-tight animate-fade-up">
          La Nuova Generazione Degli Appassionati Di Motori Storici
        </h1>
        <p className="mt-6 text-base md:text-lg text-accent-foreground/80 max-w-2xl font-body animate-fade-up" style={{ animationDelay: "0.2s" }}>
          Epocar è una community di Piacenza che unisce persone appassionate di veicoli storici attraverso eventi, raduni e cultura.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 animate-fade-up" style={{ animationDelay: "0.4s" }}>
          <Button variant="hero-primary" asChild>
            <Link to="/community">Scopri La Community</Link>
          </Button>
          <Button variant="hero-secondary" asChild>
            <Link to="/eventi">Scopri Gli Eventi</Link>
          </Button>
        </div>
        <div className="absolute bottom-10 animate-scroll-hint">
          <ChevronDown className="w-6 h-6 text-accent-foreground/60" />
        </div>
      </div>
    </section>
  );
}
