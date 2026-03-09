import { useScrollReveal } from "@/hooks/use-scroll-reveal";

const stats = [
  { value: "+300", label: "Appassionati nella community" },
  { value: "+10", label: "Eventi organizzati" },
  { value: "Piacenza", label: "e Nord Italia" },
  { value: "In crescita", label: "Community attiva" },
];

export default function CommunityNumbersSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-foreground" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 section-reveal">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className="font-headline text-4xl md:text-5xl lg:text-6xl text-background mb-2">
                {stat.value}
              </p>
              <p className="text-sm md:text-base text-background/60 font-body">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
