import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import FormBuilder from "@/components/admin/FormBuilder";
import type { FormField } from "@/lib/form-fields";
import { ArrowLeft, Upload, X, Image as ImageIcon } from "lucide-react";

const emptyForm = {
  title: "",
  description: "",
  date: "",
  location: "",
  image_url: "",
  category: "event",
  published: false,
  registration_link: "",
  registration_enabled: false,
  allow_guests: false,
  form_fields: [] as FormField[],
};

type EventForm = typeof emptyForm;

export default function AdminEventEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuovo";
  const draftKey = `epocar:draft:event:${isNew ? "new" : id}`;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState<EventForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const skipNextSave = useRef(false);

  // Load: DB (if editing) then overlay draft
  useEffect(() => {
    (async () => {
      let base: EventForm = emptyForm;
      let preview: string | null = null;
      if (!isNew && id) {
        const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
        if (data) {
          base = {
            title: data.title || "",
            description: data.description || "",
            date: data.date ? String(data.date).slice(0, 16) : "",
            location: data.location || "",
            image_url: data.image_url || "",
            category: data.category || "event",
            published: data.published ?? false,
            registration_link: data.registration_link || "",
            registration_enabled: (data as { registration_enabled?: boolean }).registration_enabled ?? false,
            allow_guests: (data as { allow_guests?: boolean }).allow_guests ?? false,
            form_fields: ((data as { form_fields?: FormField[] }).form_fields as FormField[]) || [],
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

  // Auto-save draft to localStorage
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
      description: form.description || null,
      date: form.date || null,
      location: form.location || null,
      image_url: imageUrl,
      category: form.category || "event",
      published: form.published,
      uploaded_by: user?.id || null,
      registration_link: form.registration_link || null,
      registration_enabled: form.registration_enabled,
      allow_guests: form.allow_guests,
      form_fields: form.form_fields as never,
    };
    if (isNew) await supabase.from("events").insert(payload);
    else await supabase.from("events").update(payload).eq("id", id!);
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
            {isNew ? "Nuovo evento" : "Modifica evento"}
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
          placeholder="Descrizione"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            type="datetime-local"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <AddressAutocomplete
            value={form.location}
            onChange={(val) => setForm({ ...form, location: val })}
            placeholder="Luogo"
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Immagine</label>
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

        <Input
          placeholder="Categoria"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <Input
          placeholder="Link Registrazione esterno (opzionale)"
          value={form.registration_link}
          onChange={(e) => setForm({ ...form, registration_link: e.target.value })}
        />

        <div className="border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Form di iscrizione interno</span>
            <Switch
              checked={form.registration_enabled}
              onCheckedChange={(checked) => setForm({ ...form, registration_enabled: checked })}
            />
          </div>
          {form.registration_enabled && (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.allow_guests}
                  onCheckedChange={(checked) => setForm({ ...form, allow_guests: checked })}
                />
                <span className="text-sm text-muted-foreground">
                  Consenti iscrizioni da ospiti (non registrati)
                </span>
              </div>
              <FormBuilder
                fields={form.form_fields}
                onChange={(fields) => setForm({ ...form, form_fields: fields })}
              />
            </>
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
            {loading ? "Salvataggio..." : isNew ? "Crea evento" : "Salva modifiche"}
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