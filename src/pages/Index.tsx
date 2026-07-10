import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProssimoEventoSection from "@/components/ProssimoEventoSection";
import CommunityNumbersSection from "@/components/CommunityNumbersSection";
import MissionSection from "@/components/MissionSection";
import EventiSection from "@/components/EventiSection";
import CommunitySection from "@/components/CommunitySection";
import InstagramSection from "@/components/InstagramSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";

const Index = () => {
  return (
    <>
      <PageMeta
        title="Epocar — Community motori d'epoca a Piacenza"
        description="Epocar è la nuova generazione di appassionati di auto, moto e Vespa d'epoca a Piacenza. Scopri raduni, articoli e la nostra community."
        path="/"
      />
      <Navbar />
      <main>
        <HeroSection />
        <ProssimoEventoSection />
        <CommunityNumbersSection />
        <MissionSection />
        <EventiSection />
        <CommunitySection />
        <InstagramSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
};

export default Index;
