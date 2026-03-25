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
      <div className="absolute inset-0 bg-foreground/60" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
        <h1 className="font-headline text-7xl md:text-9xl lg:text-[12rem] text-primary-foreground leading-none tracking-wider animate-fade-up">
          EPOCAR
        </h1>
        <div className="w-24 h-0.5 bg-primary-foreground/60 my-4 animate-fade-up" style={{ animationDelay: "0.15s" }} />
        <p className="text-base md:text-xl text-primary-foreground/80 font-body tracking-wide animate-fade-up" style={{ animationDelay: "0.2s" }}>
          La nuova generazione dei motori d'epoca
        </p>

        <div className="absolute bottom-10 animate-scroll-hint">
          <ChevronDown className="w-6 h-6 text-primary-foreground/60" />
        </div>
      </div>
    </section>
  );
}
