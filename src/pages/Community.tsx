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
      <main>
        <section className="bg-foreground pt-32 pb-24 lg:pt-40 lg:pb-32" ref={ref}>
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="section-reveal mb-16">
              <h1 className="font-headline text-6xl md:text-8xl lg:text-9xl text-primary-foreground leading-none tracking-wider">
                COMMUNITY
              </h1>
              <div className="w-24 h-0.5 bg-primary-foreground/30 mt-4" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 section-reveal" style={{ transitionDelay: "0.2s" }}>
              <div>
                <p className="text-base text-primary-foreground/70 leading-relaxed mb-6">
                  Epocar è una community aperta a proprietari di veicoli storici, giovani appassionati, collezionisti e a chiunque sia curioso del mondo dei motori d'epoca.
                </p>
                <p className="text-base text-primary-foreground/70 leading-relaxed mb-8">
                  Il nostro obiettivo è comunicare passione, amicizia ed esperienze condivise attorno alla bellezza dei veicoli che hanno fatto la storia.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {["Proprietari di veicoli storici", "Giovani appassionati", "Collezionisti", "Curiosi del mondo d'epoca"].map((item) => (
                    <div key={item} className="py-3 border-t border-primary-foreground/20">
                      <span className="text-sm font-medium text-primary-foreground">{item}</span>
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
        </section>
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
