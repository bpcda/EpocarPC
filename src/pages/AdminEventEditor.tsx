import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RichTextEditor from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { isoToRomeInput, romeInputToISO } from "@/lib/event-time";
import FormBuilder from "@/components/admin/FormBuilder";
import EventBookingSettings from "@/components/admin/EventBookingSettings";
import { defaultBookingSettings, settingsFrom, bookingSettingsSchema } from "@/lib/event-booking-schema";
import type { FormField } from "@/lib/form-fields";
import { ArrowLeft, Upload, X, Image as ImageIcon, Save } from "lucide-react";

const emptyForm = {
  title: "",
  description: "",
  date: "",
  end_date: "",
  show_homepage_countdown: false,
  location: "",
  image_url: "",
  category: "event",
  published: false,
  registration_link: "",
  registration_enabled: false,
  allow_guests: false,
  form_fields: [] as FormField[],
  booking_settings: { ...defaultBookingSettings },
};

type EventForm = typeof emptyForm;

export default function AdminEventEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuovo";
  const draftKey = `epocar:draft:event:${isNew ? "new" : id}`;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState<EventForm>(emptyForm);
  const [bookingInstalled, setBookingInstalled] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const skipNextSave = useRef(false);

  // Load: DB (if editing) then overlay draft
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
      let base: EventForm = emptyForm;
      let preview: string | null = null;
      if (!isNew && id) {
        const { data, error: readError } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
        if (readError || !data) throw new Error("Evento non disponibile");
        if (data) {
          base = {
            title: data.title || "",
            description: data.description || "",
            date: isoToRomeInput(data.date),
            end_date: isoToRomeInput(data.end_date),
            show_homepage_countdown: data.show_homepage_countdown ?? false,
            location: data.location || "",
            image_url: data.image_url || "",
            category: data.category || "event",
            published: data.published ?? false,
            registration_link: data.registration_link || "",
            registration_enabled: (data as unknown as { registration_enabled?: boolean }).registration_enabled ?? false,
            allow_guests: (data as unknown as { allow_guests?: boolean }).allow_guests ?? false,
            form_fields: ((data as unknown as { form_fields?: FormField[] }).form_fields as FormField[]) || [],
            booking_settings: settingsFrom((data as unknown as { booking_settings?: unknown }).booking_settings),
          };
          if (!cancelled) setBookingInstalled("booking_settings" in data);
          preview = data.image_url || null;
        }
      }
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) base = { ...base, ...JSON.parse(raw) };
      } catch { /* ignore */ }
      if (cancelled) return;
      skipNextSave.current = true;
      setForm(base);
      setImagePreview(base.image_url || preview);
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
        setError("Non riusciamo a caricare l’evento. Riapri la pagina prima di modificarlo.");
      }
      setInitialized(true);
    })();
    return () => { cancelled = true; };
  }, [id, isNew, draftKey]);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (!initialized || loadFailed || loading) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
      setSavedAt(new Date());
    } catch { /* ignore */ }
  }, [form, initialized, loadFailed, loading, draftKey]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Scegli un file immagine."); return; }
    setError("");
    setImageFile(file);
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
    if (error) return null;
    const { data } = supabase.storage.from("event-images").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!form.title.trim() || loading || !initialized || loadFailed || (!isNew && !id)) return;
    setError("");
    const settings = bookingSettingsSchema.safeParse(form.booking_settings);
    if (!settings.success) { setError("Controlla impostazioni e limiti delle prenotazioni."); return; }
    if (settings.data.enabled && (!settings.data.privacy_text || !settings.data.privacy_version)) { setError("Inserisci informativa privacy e versione."); return; }
    const date = form.date ? romeInputToISO(form.date) : null;
    const end_date = form.end_date ? romeInputToISO(form.end_date) : null;
    if (end_date && date && end_date < date) { setError("La fine deve essere successiva all’inizio."); return; }
    setLoading(true);
    try {
    let imageUrl = form.image_url || null;
    if (imageFile) {
      const uploaded = await uploadImage(imageFile);
      if (!uploaded) throw new Error("upload");
      imageUrl = uploaded;
      setForm(previous => ({ ...previous, image_url: uploaded }));
      setImageFile(null); setImagePreview(uploaded);
    }
    const payload = {
      title: form.title.trim(),
      description: form.description || null,
      date,
      end_date,
      show_homepage_countdown: form.show_homepage_countdown,
      location: form.location || null,
      image_url: imageUrl,
      category: form.category || "event",
      published: form.published,
      ...(isNew ? { uploaded_by: user?.id || null } : {}),
      registration_link: form.registration_link || null,
      registration_enabled: form.registration_enabled,
      allow_guests: form.allow_guests,
      form_fields: form.form_fields as never,
      ...(settings.data.enabled || bookingInstalled ? { booking_settings: settings.data } : {}),
    };
    // The external schema is installed independently; preserve the runtime extension without changing generated types.
    const typedPayload = payload as Omit<typeof payload, "booking_settings">;
    const result = isNew ? await supabase.from("events").insert(typedPayload).select("id").single() : await supabase.from("events").update(typedPayload).eq("id", id ?? "").select("id").single();
    if (result.error || !result.data) throw new Error("save");
    localStorage.removeItem(draftKey);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["events"] }), queryClient.invalidateQueries({ queryKey: ["admin", "events"] })]);
    navigate("/admin?tab=events");
    } catch { setError("Non possiamo confermare il salvataggio. Le modifiche restano qui: controlla l’elenco prima di riprovare."); }
    finally { setLoading(false); }
  };

  const handleDiscardDraft = () => {
    if (!confirm("Scartare le modifiche non salvate?")) return;
    localStorage.removeItem(draftKey);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <Link to="/admin?tab=events" className="inline-flex items-center gap-2 min-h-11 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Tutti gli eventi</Link>
          <h1 className="text-3xl sm:text-4xl font-headline text-foreground mt-2">
            {isNew ? "Nuovo evento" : "Modifica evento"}
          </h1>
          <div role="status" className="text-xs text-muted-foreground mt-3">
            {savedAt ? `Copia locale · ${savedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Prepara il racconto e i dettagli dell’incontro."}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {error && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
        {!initialized && <p role="status">Caricamento evento…</p>}
        <fieldset disabled={!initialized || loading || loadFailed} className="min-w-0 space-y-6">
        <section className="border border-border bg-card p-4 sm:p-6 space-y-5" aria-labelledby="event-content-title">
        <div><h2 id="event-content-title" className="font-headline text-2xl">Racconta l’evento</h2><p className="text-sm text-muted-foreground mt-1">Presentazione e programma, con titoli, elenchi e link.</p></div>
        <Label htmlFor="event-title" className="block">Titolo *</Label>
        <Input
          id="event-title"
          placeholder="Titolo *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <div className="space-y-2"><p className="text-sm font-medium">Descrizione</p><RichTextEditor disabled={loading || !initialized || loadFailed} label="Descrizione evento" content={form.description} onChange={description => setForm(previous => ({ ...previous, description }))} /></div>
        </section>
        <section className="border border-border bg-card p-4 sm:p-6 space-y-5" aria-labelledby="event-date-title">
        <h2 id="event-date-title" className="font-headline text-2xl">Quando e dove</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Inizio (ora italiana)</span>
            <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Fine (facoltativa, per eventi di più ore o giorni)</span>
            <Input type="datetime-local" value={form.end_date} min={form.date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </label>
          <div className="md:col-span-2 space-y-2"><p className="text-sm font-medium">Luogo</p><AddressAutocomplete
            value={form.location}
            onChange={(val) => setForm({ ...form, location: val })}
            placeholder="Luogo"
          /></div>
        </div>
        </section>

        <section className="border border-border bg-card p-4 sm:p-6">
          <label className="text-sm text-muted-foreground mb-2 block">Immagine</label>
          {imagePreview ? (
            <div className="relative rounded-md overflow-hidden border border-border">
              <img src={imagePreview} alt="Anteprima" className="w-full h-56 object-cover" />
              <button
                type="button"
                aria-label="Rimuovi immagine evento"
                onClick={() => { setImageFile(null); setImagePreview(null); setForm({ ...form, image_url: "" }); }}
                className="absolute top-2 right-2 bg-foreground/70 text-background rounded-full p-3 hover:bg-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
                dragging ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                {dragging ? <Upload className="h-8 w-8 text-accent" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                <p className="text-sm text-muted-foreground">
                  {dragging ? "Rilascia qui" : "Trascina un’immagine o scegli un file"}
                </p>
                <Input aria-label="Scegli immagine evento" type="file" accept="image/*" className="max-w-full min-h-11" onChange={e => { const file = e.target.files?.[0]; if (file) handleFileSelect(file); }} />
              </div>
            </div>
          )}
        </section>

        <section className="border border-border bg-card p-4 sm:p-6 space-y-5" aria-labelledby="event-registration-title">
        <h2 id="event-registration-title" className="font-headline text-2xl">Partecipazione</h2>
        <Label htmlFor="event-category" className="block">Categoria</Label>
        <Input
          id="event-category"
          placeholder="Categoria"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <Label htmlFor="event-registration-link" className="block">Link di iscrizione esterno (facoltativo)</Label>
        <Input
          id="event-registration-link"
          placeholder="Link Registrazione esterno (opzionale)"
          value={form.registration_link}
          onChange={(e) => setForm({ ...form, registration_link: e.target.value })}
        />

        <div className="border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Form di iscrizione interno</span>
            <Switch
              aria-label="Form di iscrizione interno"
              checked={form.registration_enabled}
              onCheckedChange={(checked) => setForm({ ...form, registration_enabled: checked })}
            />
          </div>
          {form.registration_enabled && (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  aria-label="Consenti iscrizioni da ospiti"
                  checked={form.allow_guests}
                  onCheckedChange={(checked) => setForm({ ...form, allow_guests: checked })}
                />
                <span className="text-sm text-muted-foreground">
                  Consenti iscrizioni da ospiti (non registrati)
                </span>
              </div>
              <EventBookingSettings value={form.booking_settings} onChange={booking_settings => setForm({ ...form, booking_settings, allow_guests: booking_settings.enabled ? true : form.allow_guests })} />
              <FormBuilder
                fields={form.form_fields}
                onChange={(fields) => setForm({ ...form, form_fields: fields })}
              />
            </>
          )}
        </div>
        </section>

        <section className="border border-border bg-card p-4 sm:p-6 space-y-5" aria-labelledby="event-publish-title">
        <h2 id="event-publish-title" className="font-headline text-2xl">Visibilità</h2>
        <div className="flex items-center gap-3">
          <Switch
            aria-label="Pubblica evento"
            checked={form.published}
            onCheckedChange={(checked) => setForm({ ...form, published: checked })}
          />
          <div><span className="text-sm">Pubblica sul sito</span><p className="text-xs text-muted-foreground mt-1">{form.published ? "Visibile ai visitatori dopo il salvataggio." : "Bozza: visibile solo nella dashboard."}</p></div>
        </div>

        <div className="flex items-start gap-3">
          <Switch
            aria-label="Mostra countdown in homepage"
            checked={form.show_homepage_countdown}
            onCheckedChange={(checked) => setForm({ ...form, show_homepage_countdown: checked })}
          />
          <div>
            <span className="text-sm text-foreground">Mostra countdown in homepage</span>
            <p className="text-xs text-muted-foreground">Se attivo, questo evento verrà mostrato con un conto alla rovescia nella homepage fino all'inizio/conclusione dell'evento. Un solo evento alla volta: attivandolo qui si disattiva su quello scelto in precedenza.</p>
          </div>
        </div>
        </section>
        </fieldset>

        <div className="flex justify-end"><Button variant="ghost" className="min-h-11" onClick={handleDiscardDraft} disabled={loading || loadFailed}>Scarta modifiche locali</Button></div>
        <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 border-t border-border bg-background/95 p-4 sm:px-0 backdrop-blur flex flex-wrap gap-3">
          <Button className="flex-1 sm:flex-none min-h-11" onClick={handleSave} disabled={!form.title.trim() || loading || !initialized || loadFailed}>
            <Save className="h-4 w-4 mr-2" />{loading ? "Salvataggio…" : form.published ? "Salva e pubblica" : "Salva bozza"}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => navigate("/admin?tab=events")} disabled={loading}>
            Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}
