import { ChevronDown } from "lucide-react";
import heroImage from "@/assets/hero-car.jpg";
import { useHomepage } from "@/hooks/use-cms";

export const HERO_FALLBACK = {
  title: "EPOCAR — La nuova generazione dei motori d'epoca",
  subtitle: "La nuova generazione dei motori d'epoca",
};

export default function HeroSection() {
  const { data: home } = useHomepage();
  const img = home?.heroImage;
  return (
    <section className="relative h-screen w-full overflow-hidden">
      <img
        src={img?.url ?? heroImage}
        srcSet={img?.srcSet}
        sizes={img?.srcSet ? "100vw" : undefined}
        alt={img?.alt || "Classic car in Italian piazza"}
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
          {home?.heroTitle ?? HERO_FALLBACK.title}
        </h1>
        <div className="w-24 h-0.5 bg-primary-foreground/60 my-4 animate-fade-up" style={{ animationDelay: "0.15s" }} />
        <p className="text-base md:text-xl text-primary-foreground/80 font-body tracking-wide animate-fade-up" style={{ animationDelay: "0.2s" }}>
          {home?.heroSubtitle ?? HERO_FALLBACK.subtitle}
        </p>

        <div className="absolute bottom-10 animate-scroll-hint">
          <ChevronDown className="w-6 h-6 text-primary-foreground/60" />
        </div>
      </div>
    </section>
  );
}
