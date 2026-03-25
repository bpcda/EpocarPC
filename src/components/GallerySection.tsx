import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GalleryImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
}

export default function GallerySection() {
  const sectionRef = useScrollReveal();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const fetchImages = async () => {
      const { data } = await supabase
        .from("gallery_images")
        .select("*")
        .order("sort_order", { ascending: true });
      if (data) setImages(data);
    };
    fetchImages();
  }, []);

  // Horizontal scroll with mouse wheel
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Only hijack scroll if there's horizontal content to scroll
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;

      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= maxScroll - 1 && e.deltaY > 0;

      if (!atStart && !atEnd) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [images]);

  // Touch drag for mobile
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setScrollLeft(scrollRef.current?.scrollLeft ?? 0);
    scrollRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !scrollRef.current) return;
    const dx = e.clientX - startX;
    scrollRef.current.scrollLeft = scrollLeft - dx;
  };

  const handlePointerUp = () => setIsDragging(false);

  if (images.length === 0) return null;

  return (
    <section id="gallery" className="py-24 lg:py-32" ref={sectionRef}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-reveal mb-12">
          <h2 className="font-headline text-5xl md:text-7xl lg:text-8xl text-foreground tracking-wider">
            GALLERY
          </h2>
          <div className="w-24 h-0.5 bg-foreground/30 mt-2" />
        </div>
      </div>

      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="section-reveal flex gap-2 overflow-x-auto cursor-grab active:cursor-grabbing px-6 lg:px-8 scrollbar-hide"
        style={{ transitionDelay: "0.2s", scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {images.map((img) => (
          <div
            key={img.id}
            className="group relative flex-shrink-0 overflow-hidden"
            style={{ width: "clamp(280px, 30vw, 450px)", aspectRatio: "3/4" }}
          >
            <img
              src={img.image_url}
              alt={img.alt_text || "Gallery"}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 select-none pointer-events-none"
              loading="lazy"
              draggable={false}
            />
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors duration-300" />
          </div>
        ))}
      </div>
    </section>
  );
}
