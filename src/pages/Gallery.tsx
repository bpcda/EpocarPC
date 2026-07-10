import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GalleryImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
}

const PAGE_SIZE = 20;
const THUMB_WIDTH = 600;
// Client-side rate limiting knobs
const MIN_FETCH_INTERVAL_MS = 600;   // throttle between requests
const AUTO_PAGES_BEFORE_PROMPT = 5;  // after N auto pages, require a click
const CACHE_KEY = "epocar:gallery:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes

const getThumbUrl = (url: string, width = THUMB_WIDTH) => {
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace("/object/public/", "/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=75&resize=contain`;
};

export default function Gallery() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inflightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
  const [needsUserAction, setNeedsUserAction] = useState(false);

  const fetchPage = useCallback(async (pageIndex: number) => {
    // Guard: single inflight + minimum interval between requests
    if (inflightRef.current) return;
    const now = Date.now();
    const wait = Math.max(0, MIN_FETCH_INTERVAL_MS - (now - lastFetchAtRef.current));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    inflightRef.current = true;
    lastFetchAtRef.current = Date.now();
    setLoading(true);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("gallery_images")
      .select("id, image_url, alt_text, sort_order")
      .order("sort_order", { ascending: true })
      .range(from, to);

    if (!error && data) {
      setImages((prev) => {
        const next = pageIndex === 0 ? data : [...prev, ...data];
        // cache only the first page for quick revisits
        if (pageIndex === 0) {
          try {
            sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ ts: Date.now(), images: data, hasMore: data.length === PAGE_SIZE }),
            );
          } catch { /* quota */ }
        }
        return next;
      });
      setHasMore(data.length === PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setLoading(false);
    setInitialLoad(false);
    inflightRef.current = false;
  }, []);

  useEffect(() => {
    // Hydrate from session cache to skip the first network call on revisits
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; images: GalleryImage[]; hasMore: boolean };
        if (Date.now() - parsed.ts < CACHE_TTL_MS && Array.isArray(parsed.images)) {
          setImages(parsed.images);
          setHasMore(!!parsed.hasMore);
          setInitialLoad(false);
          return;
        }
      }
    } catch { /* ignore */ }
    fetchPage(0);
  }, [fetchPage]);

  // Infinite scroll verticale (window)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || needsUserAction) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !inflightRef.current) {
          const next = page + 1;
          // Soft cap: after some auto pages, stop and wait for a click
          if (next >= AUTO_PAGES_BEFORE_PROMPT) {
            setNeedsUserAction(true);
            return;
          }
          setPage(next);
          fetchPage(next);
        }
      },
      { rootMargin: "300px 0px", threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [page, hasMore, loading, fetchPage, images.length, needsUserAction]);

  const loadMoreManual = () => {
    const next = page + 1;
    setNeedsUserAction(false);
    setPage(next);
    fetchPage(next);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-foreground pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 lg:py-20">
          <h1 className="font-headline text-5xl md:text-7xl lg:text-8xl text-primary-foreground tracking-wider mb-2">
            GALLERY
          </h1>
          <div className="w-24 h-0.5 bg-primary-foreground/30 mb-10" />

          {initialLoad ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="w-full aspect-square rounded-none" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <p className="text-primary-foreground/60 text-center py-24">Nessuna immagine disponibile.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {images.map((img, idx) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setLightbox(img)}
                    className="group relative overflow-hidden bg-muted/30 p-0 border-0 aspect-square w-full"
                  >
                    <img
                      src={getThumbUrl(img.image_url)}
                      alt={img.alt_text || "Gallery"}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 select-none"
                      loading={idx < 4 ? "eager" : "lazy"}
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

                {hasMore &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={`s-${i}`} className="w-full aspect-square rounded-none" />
                  ))}
              </div>

              {hasMore && !needsUserAction && <div ref={sentinelRef} className="h-10 w-full" />}
              {hasMore && needsUserAction && (
                <div className="flex justify-center mt-8">
                  <Button variant="outline" onClick={loadMoreManual} disabled={loading}>
                    {loading ? "Caricamento…" : "Carica altre immagini"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
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
