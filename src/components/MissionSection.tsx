import { useScrollReveal } from "@/hooks/use-scroll-reveal";

export default function MissionSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-foreground text-background" ref={ref}>
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center section-reveal">
        <p className="text-sm font-medium tracking-widest text-background/50 uppercase mb-6">La Nostra Missione</p>
        <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl leading-tight mb-10">
          Promuovere e preservare la cultura dei veicoli storici, avvicinando le nuove generazioni attraverso eventi ed esperienze condivise.
        </h2>
        <div className="grid grid-cols-2 gap-0 max-w-md mx-auto mt-16">
          {["COMMUNITY", "EVENTI", "CULTURA", "PASSIONE"].map((word) => (
            <div key={word} className="py-4 px-2">
              <span className="text-sm md:text-base font-body font-semibold tracking-[0.2em] text-background/70">
                {word}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
