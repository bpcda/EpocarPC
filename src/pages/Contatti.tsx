import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { Button } from "@/components/ui/button";

export default function ContattiPage() {
  const ref = useScrollReveal();

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-16 lg:py-24" ref={ref}>
          <div className="section-reveal mb-16">
            <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Contatti</p>
            <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl text-foreground">
              Parliamone
            </h1>
          </div>
          <div className="section-reveal space-y-8" style={{ transitionDelay: "0.2s" }}>
            <p className="text-base text-muted-foreground leading-relaxed">
              Vuoi saperne di più su Epocar, partecipare ai nostri eventi o proporre una collaborazione? Scrivici.
            </p>
            <div className="space-y-4">
              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Email</p>
                <p className="text-foreground">info@epocar.it</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Città</p>
                <p className="text-foreground">Piacenza, Italia</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Social</p>
                <Button variant="accent" size="default" asChild>
                  <a href="https://instagram.com/epocar" target="_blank" rel="noopener noreferrer">
                    Seguici su Instagram
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
