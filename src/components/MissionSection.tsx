import { useScrollReveal } from "@/hooks/use-scroll-reveal";

export default function MissionSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-foreground text-primary-foreground" ref={ref}>
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center section-reveal">
        <p className="text-sm font-body font-medium tracking-widest text-primary-foreground/50 uppercase mb-6">La Nostra Missione</p>
        <h2 className="font-headline text-3xl md:text-5xl lg:text-6xl leading-tight mb-10 tracking-wide">
          Promuovere e preservare la cultura dei veicoli storici, avvicinando le nuove generazioni attraverso eventi ed esperienze condivise.
        </h2>
      </div>
    </section>
  );
}
