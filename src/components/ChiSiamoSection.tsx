import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import communityImage from "@/assets/community-gathering.jpg";

export default function ChiSiamoSection() {
  const ref = useScrollReveal();

  return (
    <section id="chi-siamo" className="py-24 lg:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-4 section-reveal">
            <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Chi Siamo</p>
            <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl text-foreground leading-tight mb-6">
              Nati Dalla Passione
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-4">
              Epocar nasce da un gruppo di giovani appassionati di Piacenza che volevano creare uno spazio dove condividere la passione per i veicoli storici.
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Non un club tradizionale, ma una community moderna che unisce heritage e nuova generazione, celebrando auto d'epoca, moto storiche e Vespa attraverso eventi, cultura e amicizia.
            </p>
          </div>
          <div className="lg:col-span-8 section-reveal" style={{ transitionDelay: "0.2s" }}>
            <div className="relative -mr-6 lg:-mr-8">
              <img
                src={communityImage}
                alt="Community Epocar gathering"
                className="w-full h-[400px] lg:h-[550px] object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
