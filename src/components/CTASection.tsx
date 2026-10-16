import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import heroImage from "@/assets/hero-car.jpg";
import { useHomepage } from "@/hooks/use-cms";
import { SmartLink } from "@/components/cms/CmsContent";

export default function CTASection() {
  const ref = useScrollReveal();
  const { data: home } = useHomepage();
  const primary = home?.ctaPrimary ?? { label: "Scopri Gli Eventi", url: "/eventi" };
  const secondary = home?.ctaSecondary ?? { label: "Segui Su Instagram", url: "https://instagram.com/epocar.official" };

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
          {home?.ctaTitle ?? "UNISCITI A EPOCAR"}
        </h2>
        <div className="w-24 h-0.5 bg-primary-foreground/40 mx-auto mb-6" />
        <p className="text-base md:text-lg text-primary-foreground/70 max-w-xl mx-auto mb-10">
          {home?.ctaText ?? "Entra a far parte della nuova generazione di appassionati di motori storici."}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="hero-primary" asChild>
            <SmartLink href={primary.url}>{primary.label}</SmartLink>
          </Button>
          <Button variant="hero-secondary" asChild>
            <SmartLink href={secondary.url}>{secondary.label}</SmartLink>
          </Button>
        </div>
      </div>
    </section>
  );
}
