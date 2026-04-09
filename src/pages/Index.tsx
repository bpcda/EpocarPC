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

const Index = () => {
  return (
    <>
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
