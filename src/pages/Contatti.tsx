import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

export default function ContattiPage() {
  const ref = useScrollReveal();

  return (
    <>
      <Navbar />
      <main>
        {/* Full burgundy hero */}
        <section className="bg-foreground min-h-screen flex items-center" ref={ref}>
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-32 lg:py-40 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="section-reveal">
                <h1 className="font-headline text-6xl md:text-8xl lg:text-9xl text-primary-foreground leading-none tracking-wider mb-4">
                  CONTATTI
                </h1>
                <div className="w-full max-w-md h-0.5 bg-primary-foreground/30 mb-12" />

                <div className="space-y-8">
                  <div>
                    <h3 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                      EMAIL:
                    </h3>
                    <a href="mailto:info@epocar.it" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-base">
                      info@epocar.it
                    </a>
                  </div>
                  <div>
                    <h3 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                      INSTAGRAM
                    </h3>
                    <a
                      href="https://instagram.com/epocar.official"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-base"
                    >
                      @epocar.official
                    </a>
                  </div>
                  <div>
                    <h3 className="font-headline text-2xl md:text-3xl text-primary-foreground tracking-wider">
                      TIKTOK
                    </h3>
                    <a
                      href="https://tiktok.com/@epocar"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-base"
                    >
                      @epocar
                    </a>
                  </div>
                </div>
              </div>

              {/* Instagram mockup placeholder */}
              <div className="section-reveal hidden lg:flex justify-center" style={{ transitionDelay: "0.2s" }}>
                <div className="w-[280px] bg-primary-foreground/5 border border-primary-foreground/10 rounded-[2rem] p-3 shadow-2xl">
                  <div className="bg-primary-foreground/10 rounded-[1.5rem] p-4 h-[500px] flex flex-col items-center justify-center">
                    <p className="font-headline text-3xl text-primary-foreground tracking-wider mb-2">EPOCAR</p>
                    <p className="text-primary-foreground/50 text-sm">@epocar.official</p>
                    <div className="flex gap-6 mt-4">
                      <div className="text-center">
                        <p className="font-headline text-lg text-primary-foreground">110</p>
                        <p className="text-xs text-primary-foreground/50">post</p>
                      </div>
                      <div className="text-center">
                        <p className="font-headline text-lg text-primary-foreground">2269</p>
                        <p className="text-xs text-primary-foreground/50">follower</p>
                      </div>
                      <div className="text-center">
                        <p className="font-headline text-lg text-primary-foreground">2887</p>
                        <p className="text-xs text-primary-foreground/50">seguiti</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
