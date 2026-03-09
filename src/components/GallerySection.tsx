import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";
import gallery4 from "@/assets/gallery-4.jpg";
import gallery5 from "@/assets/gallery-5.jpg";
import gallery6 from "@/assets/gallery-6.jpg";

const images = [
  { src: gallery1, alt: "Alfa Romeo d'epoca" },
  { src: gallery2, alt: "Vespa classica" },
  { src: gallery3, alt: "Moto storica" },
  { src: gallery4, alt: "Ritrovo appassionati" },
  { src: gallery5, alt: "Interni Fiat 500" },
  { src: gallery6, alt: "Vespa in fila" },
];

export default function GallerySection() {
  const ref = useScrollReveal();

  return (
    <section id="gallery" className="py-24 lg:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal mb-12">
          <h2 className="font-headline text-5xl md:text-7xl lg:text-8xl text-foreground tracking-wider">
            GALLERY
          </h2>
          <div className="w-24 h-0.5 bg-foreground/30 mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 section-reveal" style={{ transitionDelay: "0.2s" }}>
          {images.map((img, i) => (
            <div key={i} className="group relative overflow-hidden aspect-square cursor-pointer">
              <img
                src={img.src}
                alt={img.alt}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
