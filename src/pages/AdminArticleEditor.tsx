import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import RichTextEditor from "@/components/RichTextEditor";
import { ArrowLeft, Upload, X, Image as ImageIcon } from "lucide-react";

const emptyForm = {
  title: "",
  summary: "",
  content: "",
  image_url: "",
  published: false,
};

type ArticleForm = typeof emptyForm;

export default function AdminArticleEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuovo";
  const draftKey = `epocar:draft:article:${isNew ? "new" : id}`;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const skipNextSave = useRef(false);

  useEffect(() => {
    (async () => {
      let base: ArticleForm = emptyForm;
      let preview: string | null = null;
      if (!isNew && id) {
        const { data } = await supabase.from("articles").select("*").eq("id", id).maybeSingle();
        if (data) {
          base = {
            title: data.title || "",
            summary: data.summary || "",
            content: data.content || "",
            image_url: data.image_url || "",
            published: data.published ?? false,
          };
          preview = data.image_url || null;
        }
      }
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) base = { ...base, ...JSON.parse(raw) };
      } catch { /* ignore */ }
      skipNextSave.current = true;
      setForm(base);
      setImagePreview(preview);
      setInitialized(true);
    })();
  }, [id, isNew, draftKey]);

  useEffect(() => {
    if (!initialized) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
      setSavedAt(new Date());
    } catch { /* ignore */ }
  }, [form, initialized, draftKey]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
  }, []);

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("event-images")
      .upload(fileName, file, { contentType: file.type });
    if (error) { console.error("Upload error:", error); return null; }
    const { data } = supabase.storage.from("event-images").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!form.title) return;
    setLoading(true);
    let imageUrl = form.image_url || null;
    if (imageFile) {
      const uploaded = await uploadImage(imageFile);
      if (uploaded) imageUrl = uploaded;
    }
    const payload = {
      title: form.title,
      summary: form.summary || null,
      content: form.content || null,
      image_url: imageUrl,
      published: form.published,
      uploaded_by: user?.id || null,
    };
    if (isNew) await supabase.from("articles").insert(payload);
    else await supabase.from("articles").update(payload).eq("id", id!);
    localStorage.removeItem(draftKey);
    setLoading(false);
    navigate("/admin");
  };

  const handleDiscardDraft = () => {
    if (!confirm("Scartare le modifiche non salvate?")) return;
    localStorage.removeItem(draftKey);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </button>
          <h1 className="text-lg font-headline text-foreground truncate">
            {isNew ? "Nuovo articolo" : "Modifica articolo"}
          </h1>
          <div className="text-xs text-muted-foreground min-w-[110px] text-right">
            {savedAt ? `Bozza salvata ${savedAt.toLocaleTimeString("it-IT")}` : ""}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        <Input
          placeholder="Titolo *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Textarea
          placeholder="Sommario (breve descrizione)"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          rows={3}
        />
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Contenuto</label>
          <RichTextEditor
            content={form.content}
            onChange={(html) => setForm({ ...form, content: html })}
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Immagine di copertina</label>
          {imagePreview ? (
            <div className="relative rounded-md overflow-hidden border border-border">
              <img src={imagePreview} alt="Anteprima" className="w-full h-56 object-cover" />
              <button
                type="button"
                onClick={() => { setImageFile(null); setImagePreview(null); setForm({ ...form, image_url: "" }); }}
                className="absolute top-2 right-2 bg-foreground/70 text-background rounded-full p-1 hover:bg-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file"; input.accept = "image/*";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileSelect(file);
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
                  {dragging ? "Rilascia qui" : "Trascina un'immagine o clicca per selezionare"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={form.published}
            onCheckedChange={(checked) => setForm({ ...form, published: checked })}
          />
          <span className="text-sm text-muted-foreground">Pubblicato</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button className="flex-1" onClick={handleSave} disabled={!form.title || loading}>
            {loading ? "Salvataggio..." : isNew ? "Crea articolo" : "Salva modifiche"}
          </Button>
          <Button variant="outline" onClick={handleDiscardDraft} disabled={loading}>
            Scarta bozza
          </Button>
          <Button variant="ghost" onClick={() => navigate("/admin")} disabled={loading}>
            Annulla
          </Button>
        </div>
      </main>
    </div>
  );
}