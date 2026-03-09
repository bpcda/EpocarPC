import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery4 from "@/assets/gallery-4.jpg";
import gallery5 from "@/assets/gallery-5.jpg";
import gallery6 from "@/assets/gallery-6.jpg";
import eventRitrovo from "@/assets/event-ritrovo.jpg";

const feed = [
  { src: eventRitrovo, alt: "Post Instagram 1" },
  { src: gallery1, alt: "Post Instagram 2" },
  { src: gallery2, alt: "Post Instagram 3" },
  { src: gallery4, alt: "Post Instagram 4" },
  { src: gallery5, alt: "Post Instagram 5" },
  { src: gallery6, alt: "Post Instagram 6" },
];

export default function InstagramSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 lg:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal text-center mb-12">
          <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-4">Instagram</p>
          <h2 className="font-headline text-3xl md:text-4xl lg:text-5xl text-foreground">
            Segui Epocar Su Instagram
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 section-reveal" style={{ transitionDelay: "0.2s" }}>
          {feed.map((img, i) => (
            <a
              key={i}
              href="https://instagram.com/epocar"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square overflow-hidden"
            >
              <img
                src={img.src}
                alt={img.alt}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors duration-300 flex items-center justify-center">
                <span className="text-background opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-sm font-medium tracking-wider">
                  @epocar
                </span>
              </div>
            </a>
          ))}
        </div>
        <div className="text-center mt-10 section-reveal" style={{ transitionDelay: "0.3s" }}>
          <Button variant="accent" size="lg" asChild>
            <a href="https://instagram.com/epocar" target="_blank" rel="noopener noreferrer">
              Segui Su Instagram
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
