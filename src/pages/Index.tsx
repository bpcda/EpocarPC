import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ChiSiamoSection from "@/components/ChiSiamoSection";
import MissionSection from "@/components/MissionSection";
import EventiSection from "@/components/EventiSection";
import RubricarSection from "@/components/RubricarSection";
import CommunitySection from "@/components/CommunitySection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <ChiSiamoSection />
        <MissionSection />
        <EventiSection />
        <RubricarSection />
        <CommunitySection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
};

export default Index;
