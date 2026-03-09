import { ChevronDown } from "lucide-react";
import { Users, Star, Car } from "lucide-react";
import heroImage from "@/assets/hero-car.jpg";

const stats = [
  { icon: Users, value: "+30", label: "MEMBRI" },
  { icon: Star, value: "10", label: "EVENTI" },
  { icon: Car, value: "15", label: "VEICOLI" },
];

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

      {/* Stats bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-primary-foreground/20">
        <div className="max-w-5xl mx-auto grid grid-cols-3">
          {stats.map((stat, i) => (
            <div
              key={i}
              className={`flex items-center justify-center gap-3 py-5 ${
                i > 0 ? "border-l border-primary-foreground/20" : ""
              }`}
            >
              <stat.icon className="w-6 h-6 text-primary-foreground/70" />
              <span className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                {stat.value}
              </span>
              <span className="font-headline text-lg md:text-xl text-primary-foreground/70 tracking-widest">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
