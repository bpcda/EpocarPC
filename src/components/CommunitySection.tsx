import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import communityImage from "@/assets/community-gathering.jpg";

export default function CommunitySection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32 bg-foreground" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-8 order-2 lg:order-1 section-reveal">
            <img
              src={communityImage}
              alt="Epocar community"
              className="w-full h-[400px] lg:h-[500px] object-cover"
              loading="lazy"
            />
          </div>
          <div className="lg:col-span-4 order-1 lg:order-2 section-reveal" style={{ transitionDelay: "0.2s" }}>
            <h2 className="font-headline text-4xl md:text-5xl text-primary-foreground leading-none tracking-wider mb-6">
              APERTA A TUTTI
            </h2>
            <div className="w-16 h-0.5 bg-primary-foreground/30 mb-6" />
            <p className="text-base text-primary-foreground/70 leading-relaxed mb-4">
              Epocar è una community aperta a proprietari di veicoli storici, giovani appassionati, collezionisti e a chiunque sia curioso del mondo dei motori d'epoca.
            </p>
            <p className="text-base text-primary-foreground/70 leading-relaxed">
              L'obiettivo è comunicare passione, amicizia ed esperienze condivise attorno alla bellezza dei veicoli che hanno fatto la storia.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
