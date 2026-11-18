import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
    <section className="relative min-h-[580px] w-full overflow-hidden">
      <img
        src={img?.url ?? heroImage}
        srcSet={img?.srcSet}
        sizes={img?.srcSet ? "100vw" : undefined}
        alt={img?.alt || "Appassionati e veicoli storici a un evento Epocar"}
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        width={1920}
        height={1080}
      />
      <div className="absolute inset-0 bg-foreground/60" />

      <div className="relative z-10 max-w-6xl mx-auto flex flex-col items-center justify-center min-h-[580px] px-6 pt-32 pb-20 lg:pt-40 lg:pb-24 text-center">
        <h1 className="font-headline text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-tight tracking-wide">
          {home?.heroTitle ?? HERO_FALLBACK.title}
        </h1>
        <div className="w-24 h-0.5 bg-primary-foreground/60 my-4" />
        <p className="text-base md:text-xl text-primary-foreground/90 font-body tracking-wide">
          {home?.heroSubtitle ?? HERO_FALLBACK.subtitle}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Button variant="hero-primary" size="lg" asChild><Link to="/eventi">Scopri gli eventi</Link></Button>
          <Button variant="hero-secondary" size="lg" asChild><Link to="/associazione/iscrizione">Diventa socio</Link></Button>
        </div>
      </div>
    </section>
  );
}
