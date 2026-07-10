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
        fetchPriority="high"
        decoding="async"
        width={1920}
        height={1080}
      />
      <div className="absolute inset-0 bg-foreground/60" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
        <h1 className="font-headline text-5xl md:text-7xl lg:text-[8rem] text-primary-foreground leading-tight tracking-wider animate-fade-up">
          EPOCAR — La nuova generazione dei motori d'epoca
        </h1>
        <div className="w-24 h-0.5 bg-primary-foreground/60 my-4 animate-fade-up" style={{ animationDelay: "0.15s" }} />
        <p className="text-base md:text-xl text-primary-foreground/80 font-body tracking-wide animate-fade-up" style={{ animationDelay: "0.2s" }}>
          Community di veicoli storici a Piacenza
        </p>

        <div className="absolute bottom-10 animate-scroll-hint">
          <ChevronDown className="w-6 h-6 text-primary-foreground/60" />
        </div>
      </div>
    </section>
  );
}
