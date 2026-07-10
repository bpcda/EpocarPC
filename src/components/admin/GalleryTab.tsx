import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Upload, X, Image as ImageIcon, GripVertical, Search, Eye, EyeOff } from "lucide-react";

interface GalleryImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  uploaded_by: string | null;
  created_at: string;
}

interface GalleryTabProps {
  userId?: string;
}

const THUMB_WIDTH = 300;
const getThumbUrl = (url: string, width = THUMB_WIDTH) => {
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace("/object/public/", "/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=60&resize=contain`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function GalleryTab({ userId }: GalleryTabProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [rangeFrom, setRangeFrom] = useState<string>(daysAgoISO(30));
  const [rangeTo, setRangeTo] = useState<string>(todayISO());
  const [revealed, setRevealed] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [altText, setAltText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only ask for the row count — no image URLs, no bucket reads.
  const fetchCount = async () => {
    const { count } = await supabase
      .from("gallery_images")
      .select("id", { count: "exact", head: true });
    setTotalCount(count ?? 0);
  };

  // Fetch only rows whose created_at falls inside the requested window.
  const fetchRange = async () => {
    if (!rangeFrom || !rangeTo) return;
    setRangeLoading(true);
    const fromISO = new Date(`${rangeFrom}T00:00:00`).toISOString();
    const toISO = new Date(`${rangeTo}T23:59:59.999`).toISOString();
    const { data } = await supabase
      .from("gallery_images")
      .select("id, image_url, alt_text, sort_order, uploaded_by, created_at")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(200);
    setImages((data as GalleryImage[]) || []);
    setRevealed(true);
    setRangeLoading(false);
  };

  useEffect(() => { fetchCount(); }, []);

  const handleFileSelect = (newFiles: File[]) => {
    const imageFiles = newFiles.filter(f => f.type.startsWith("image/"));
    setFiles(prev => [...prev, ...imageFiles]);
    setPreviews(prev => [...prev, ...imageFiles.map(f => URL.createObjectURL(f))]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleFileSelect(Array.from(e.dataTransfer.files));
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAndSave = async () => {
    setLoading(true);
    // Ask the DB for the current max sort_order (metadata only, no bucket hit)
    const { data: last } = await supabase
      .from("gallery_images")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const maxOrder = last?.[0]?.sort_order ?? -1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("gallery")
        .upload(fileName, file, { contentType: file.type });

      if (error) { console.error("Upload error:", error); continue; }

      const { data: urlData } = supabase.storage.from("gallery").getPublicUrl(fileName);

      await supabase.from("gallery_images").insert({
        image_url: urlData.publicUrl,
        alt_text: altText || null,
        sort_order: maxOrder + 1 + i,
        uploaded_by: userId || null,
      });
    }

    setFiles([]);
    setPreviews([]);
    setAltText("");
    setDialogOpen(false);
    setLoading(false);
    fetchCount();
    if (revealed) fetchRange();
  };

  const handleDelete = async (img: GalleryImage) => {
    if (!confirm("Eliminare questa immagine dalla gallery?")) return;
    // Extract filename from URL
    const parts = img.image_url.split("/");
    const fileName = parts[parts.length - 1];
    await supabase.storage.from("gallery").remove([fileName]);
    await supabase.from("gallery_images").delete().eq("id", img.id);
    setImages((prev) => prev.filter((x) => x.id !== img.id));
    fetchCount();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-headline font-medium text-foreground">Gallery</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setFiles([]); setPreviews([]); setAltText(""); }
        }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Aggiungi immagini</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-headline">Carica immagini</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2 overflow-y-auto flex-1 pr-1">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.multiple = true;
                  input.onchange = (e) => {
                    const selected = (e.target as HTMLInputElement).files;
                    if (selected) handleFileSelect(Array.from(selected));
                  };
                  input.click();
                }}
                className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
                  dragging ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {dragging ? <Upload className="h-8 w-8 text-accent" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                  <p className="text-sm text-muted-foreground">
                    {dragging ? "Rilascia qui" : "Trascina immagini o clicca per selezionare"}
                  </p>
                </div>
              </div>

              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {previews.map((p, i) => (
                    <div key={i} className="relative rounded-md overflow-hidden border border-border">
                      <img src={p} alt="" className="w-full h-24 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 bg-foreground/70 text-background rounded-full p-0.5 hover:bg-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Input
                placeholder="Testo alternativo (opzionale)"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
              />

              <Button className="w-full" onClick={uploadAndSave} disabled={files.length === 0 || loading}>
                {loading ? "Caricamento..." : `Carica ${files.length} immagin${files.length === 1 ? "e" : "i"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Count + range picker: no thumbnails until admin explicitly asks */}
      <div className="border border-border bg-card p-4 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-2 text-sm">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {totalCount === null
                ? "Conteggio in corso…"
                : `${totalCount} immagin${totalCount === 1 ? "e" : "i"} nella gallery`}
            </span>
            <span className="text-xs text-muted-foreground">
              (non visualizzate per ridurre le richieste al bucket)
            </span>
          </div>
          {revealed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setImages([]); setRevealed(false); }}
            >
              <EyeOff className="h-4 w-4 mr-1" /> Nascondi
            </Button>
          )}
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Dal</label>
            <Input type="date" value={rangeFrom} max={rangeTo} onChange={(e) => setRangeFrom(e.target.value)} className="w-44" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Al</label>
            <Input type="date" value={rangeTo} min={rangeFrom} max={todayISO()} onChange={(e) => setRangeTo(e.target.value)} className="w-44" />
          </div>
          <Button size="sm" onClick={fetchRange} disabled={rangeLoading || !rangeFrom || !rangeTo}>
            {rangeLoading ? (
              "Caricamento…"
            ) : (
              <><Eye className="h-4 w-4 mr-1" /> Carica intervallo</>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Suggerimento: seleziona un intervallo ristretto per limitare le immagini scaricate.
        </p>
      </div>

      {!revealed ? null : images.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">
          Nessuna immagine caricata in questo intervallo.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="group relative rounded-md overflow-hidden border border-border aspect-square">
              <img
                src={getThumbUrl(img.image_url)}
                alt={img.alt_text || ""}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors duration-200 flex items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 text-background hover:text-background hover:bg-destructive/80"
                  onClick={() => handleDelete(img)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
              {img.alt_text && (
                <div className="absolute bottom-0 left-0 right-0 bg-foreground/60 text-background text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.alt_text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
