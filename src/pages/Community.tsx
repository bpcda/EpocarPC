import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CTASection from "@/components/CTASection";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import communityImage from "@/assets/community-gathering.jpg";
import eventVespa from "@/assets/event-vespa.jpg";

export default function CommunityPage() {
  const ref = useScrollReveal();

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24" ref={ref}>
          <div className="section-reveal mb-16">
            <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Community</p>
            <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl text-foreground max-w-3xl">
              Una Community Aperta A Tutti
            </h1>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 section-reveal" style={{ transitionDelay: "0.2s" }}>
            <div>
              <p className="text-base text-muted-foreground leading-relaxed mb-6">
                Epocar è una community aperta a proprietari di veicoli storici, giovani appassionati, collezionisti e a chiunque sia curioso del mondo dei motori d'epoca.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mb-8">
                Il nostro obiettivo è comunicare passione, amicizia ed esperienze condivise attorno alla bellezza dei veicoli che hanno fatto la storia.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {["Proprietari di veicoli storici", "Giovani appassionati", "Collezionisti", "Curiosi del mondo d'epoca"].map((item) => (
                  <div key={item} className="py-3 border-t border-border">
                    <span className="text-sm font-medium text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <img src={communityImage} alt="Community" className="w-full h-[280px] object-cover" loading="lazy" />
              <img src={eventVespa} alt="Vespa event" className="w-full h-[280px] object-cover" loading="lazy" />
            </div>
          </div>
        </div>
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
