import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface GalleryImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
}

const PAGE_SIZE = 20;
const THUMB_WIDTH = 600; // 2x of ~300 displayed for retina

// Build a transformed URL for Supabase Storage (render/image endpoint).
// If the project plan doesn't support transforms, the browser falls back via onError.
const getThumbUrl = (url: string, width = THUMB_WIDTH) => {
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace("/object/public/", "/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=75&resize=contain`;
};

export default function Gallery() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

  const fetchPage = useCallback(async (pageIndex: number) => {
    setLoading(true);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("gallery_images")
      .select("id, image_url, alt_text, sort_order")
      .order("sort_order", { ascending: true })
      .range(from, to);

    if (!error && data) {
      setImages((prev) => (pageIndex === 0 ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setLoading(false);
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  // Infinite scroll via IntersectionObserver on horizontal sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const next = page + 1;
          setPage(next);
          fetchPage(next);
        }
      },
      { root, rootMargin: "0px 600px 0px 0px", threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [page, hasMore, loading, fetchPage, images.length]);

  // Wheel → horizontal scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
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

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setScrollLeft(scrollRef.current?.scrollLeft ?? 0);
    scrollRef.current?.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !scrollRef.current) return;
    scrollRef.current.scrollLeft = scrollLeft - (e.clientX - startX);
  };
  const handlePointerUp = () => setIsDragging(false);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
          <h1 className="font-headline text-5xl md:text-7xl lg:text-8xl text-foreground tracking-wider mb-2">
            GALLERY
          </h1>
          <div className="w-24 h-0.5 bg-foreground/30 mb-12" />
        </div>

        {initialLoad ? (
          <div className="flex gap-2 overflow-hidden px-6 lg:px-8 pb-16">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-shrink-0 rounded-none"
                style={{ width: "clamp(280px, 30vw, 450px)", aspectRatio: "3/4" }}
              />
            ))}
          </div>
        ) : images.length === 0 ? (
          <p className="text-muted-foreground text-center py-24">Nessuna immagine disponibile.</p>
        ) : (
          <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex gap-2 overflow-x-auto cursor-grab active:cursor-grabbing px-6 lg:px-8 pb-16 scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => !isDragging && setLightbox(img)}
                className="group relative flex-shrink-0 overflow-hidden bg-muted/30 p-0 border-0"
                style={{ width: "clamp(280px, 30vw, 450px)", aspectRatio: "3/4" }}
              >
                <img
                  src={getThumbUrl(img.image_url)}
                  alt={img.alt_text || "Gallery"}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 select-none pointer-events-none"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (t.src !== img.image_url) t.src = img.image_url;
                  }}
                />
                <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors duration-300" />
              </button>
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="flex gap-2 flex-shrink-0">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="flex-shrink-0 rounded-none"
                    style={{ width: "clamp(280px, 30vw, 450px)", aspectRatio: "3/4" }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-0 bg-background border-0 rounded-none">
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-2 right-2 z-50 bg-background/80 text-foreground p-2 hover:bg-background"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
          {lightbox && (
            <img
              src={lightbox.image_url}
              alt={lightbox.alt_text || "Gallery"}
              className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </>
  );
}
