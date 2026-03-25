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
import { Plus, Trash2, Upload, X, Image as ImageIcon, GripVertical } from "lucide-react";

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

export default function GalleryTab({ userId }: GalleryTabProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [altText, setAltText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchImages = async () => {
    const { data } = await supabase
      .from("gallery_images")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setImages(data as GalleryImage[]);
  };

  useEffect(() => { fetchImages(); }, []);

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
    const maxOrder = images.length > 0 ? Math.max(...images.map(i => i.sort_order)) : -1;

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
    fetchImages();
  };

  const handleDelete = async (img: GalleryImage) => {
    if (!confirm("Eliminare questa immagine dalla gallery?")) return;
    // Extract filename from URL
    const parts = img.image_url.split("/");
    const fileName = parts[parts.length - 1];
    await supabase.storage.from("gallery").remove([fileName]);
    await supabase.from("gallery_images").delete().eq("id", img.id);
    fetchImages();
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
          <DialogContent className="max-w-lg" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-headline">Carica immagini</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
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

      {images.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">
          Nessuna immagine nella gallery. Clicca "Aggiungi immagini" per iniziare.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="group relative rounded-md overflow-hidden border border-border aspect-square">
              <img src={img.image_url} alt={img.alt_text || ""} className="w-full h-full object-cover" />
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
