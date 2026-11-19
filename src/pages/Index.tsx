import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProssimoEventoSection from "@/components/ProssimoEventoSection";
import CommunityNumbersSection from "@/components/CommunityNumbersSection";
import MissionSection from "@/components/MissionSection";
import CommunitySection from "@/components/CommunitySection";
import InstagramSection from "@/components/InstagramSection";
import MembershipCtaSection from "@/components/MembershipCtaSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import FeaturedNewsSection from "@/components/cms/FeaturedNewsSection";
import OrganizationsSection from "@/components/cms/OrganizationsSection";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <>
      <PageMeta
        title="Epocar — Community motori d'epoca a Piacenza"
        description="Epocar è la nuova generazione di appassionati di auto, moto e Vespa d'epoca a Piacenza. Scopri raduni, news e la nostra community."
        path="/"
      />
      <Navbar />
      <main>
        <HeroSection />
        <ProssimoEventoSection />
        <section className="bg-foreground text-primary-foreground border-y border-primary-foreground/20 py-16">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <h2 className="font-headline text-4xl md:text-5xl tracking-wider mb-4">IL SITO CRESCE CON TE</h2>
            <p className="max-w-2xl text-primary-foreground/85 leading-relaxed mb-6">Crea gratuitamente il tuo account, aggiungi i tuoi veicoli e partecipa agli eventi. Stiamo progettando anche un social interno, la tessera Wallet, itinerari e convenzioni: scopri le anteprime in costruzione.</p>
            <div className="flex flex-wrap gap-4">
              <Button variant="hero-primary" className="h-auto min-h-11 whitespace-normal" asChild><Link to="/auth?mode=signup">Crea il tuo account gratuito</Link></Button>
              <Button variant="hero-secondary" className="h-auto min-h-11 whitespace-normal" asChild><Link to="/novita">Le prossime novità</Link></Button>
            </div>
            <p className="mt-5 text-sm text-primary-foreground/80">L’account del sito non comporta l’ammissione a socio.</p>
          </div>
        </section>
        <MembershipCtaSection />
        <CommunityNumbersSection />
        <MissionSection />
        <FeaturedNewsSection />
        <CommunitySection />
        <InstagramSection />
        <OrganizationsSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
};

export default Index;
