import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RichTextEditor from "@/components/RichTextEditor";
import { articleState, publicationPayload, type PublicationMode } from "@/lib/article-publication";
import { isoToRomeInput } from "@/lib/event-time";
import { ArrowLeft, CalendarClock, Check, ImagePlus, Save, X } from "lucide-react";

const emptyForm = { title: "", summary: "", content: "", image_url: "", mode: "draft" as PublicationMode, articleDate: "", scheduledAt: "" };

export default function AdminArticleEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuovo";
  const draftKey = `epocar:draft:article:${isNew ? "new" : id}`;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [originalPublishedAt, setOriginalPublishedAt] = useState<string | null>(null);
  const [publicationInstalled, setPublicationInstalled] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const skipNextSave = useRef(false);
  const today = isoToRomeInput(new Date().toISOString()).slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const capability = await supabase.from("articles").select("published_at").limit(0);
        if (capability.error && !["42703", "PGRST204"].includes(capability.error.code)) throw capability.error;
        let base = { ...emptyForm };
        let publishedAt: string | null = null;
        if (!isNew && id) {
          const { data, error: readError } = await supabase.from("articles").select("*").eq("id", id).maybeSingle();
          if (readError || !data) throw new Error("Notizia non disponibile");
          const row = data as typeof data & { published_at?: string | null };
          publishedAt = row.published_at ?? (row.published ? row.created_at : null);
          base = { title: row.title, summary: row.summary ?? "", content: row.content ?? "", image_url: row.image_url ?? "",
            mode: articleState(row), articleDate: capability.error ? "" : isoToRomeInput(publishedAt).slice(0, 10), scheduledAt: isoToRomeInput(publishedAt) };
        }
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const draft = JSON.parse(raw);
            base = { ...base, ...draft, mode: draft.mode ?? (draft.published ? "now" : "draft") };
          }
        } catch { /* A damaged local draft must not block the saved content. */ }
        if (cancelled) return;
        skipNextSave.current = true;
        setOriginalPublishedAt(publishedAt);
        setPublicationInstalled(!capability.error);
        setForm(base);
        setImagePreview(base.image_url || null);
      } catch {
        if (!cancelled) { setLoadFailed(true); setError("Non riusciamo a caricare la notizia. Riapri la pagina prima di modificarla."); }
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, draftKey]);

  useEffect(() => {
    if (!initialized || loadFailed || loading) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    try { localStorage.setItem(draftKey, JSON.stringify(form)); setSavedAt(new Date()); } catch { /* Saving to the server remains available. */ }
  }, [form, initialized, loadFailed, loading, draftKey]);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const selectImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Scegli un file immagine."); return; }
    setError(""); setImageFile(file);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || loading || !initialized || loadFailed) return;
    setError("");
    let publication;
    try {
      if (!publicationInstalled && (form.mode === "scheduled" || form.articleDate)) throw new Error("Data personalizzata e programmazione non sono ancora disponibili. Puoi salvare una bozza o pubblicare con la data automatica.");
      publication = publicationInstalled ? publicationPayload(form, originalPublishedAt) : { published: form.mode === "now" };
    } catch (err) { setError(err instanceof Error ? err.message : "Controlla la data di pubblicazione."); return; }
    setLoading(true);
    try {
      let imageUrl = form.image_url || null;
      if (imageFile) {
        const name = `${crypto.randomUUID()}.${imageFile.name.split(".").pop()}`;
        const { error: uploadError } = await supabase.storage.from("event-images").upload(name, imageFile, { contentType: imageFile.type });
        if (uploadError) throw new Error("upload");
        imageUrl = supabase.storage.from("event-images").getPublicUrl(name).data.publicUrl;
        setForm(previous => ({ ...previous, image_url: imageUrl! }));
        setImageFile(null); setImagePreview(imageUrl);
      }
      const payload = { title: form.title.trim(), summary: form.summary || null, content: form.content || null, image_url: imageUrl, ...publication, ...(isNew ? { uploaded_by: user?.id || null } : {}) };
      const result = isNew ? await supabase.from("articles").insert(payload).select("id").single()
        : await supabase.from("articles").update(payload).eq("id", id!).select("id").single();
      if (result.error || !result.data) throw new Error("save");
      localStorage.removeItem(draftKey);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["articles"] }), queryClient.invalidateQueries({ queryKey: ["admin", "articles"] })]);
      navigate("/admin?tab=articles");
    } catch { setError("Non possiamo confermare il salvataggio. Le modifiche restano qui: controlla l’elenco prima di riprovare."); }
    finally { setLoading(false); }
  };

  const discard = () => {
    if (!confirm("Scartare le modifiche locali? La notizia salvata sul sito non viene eliminata.")) return;
    localStorage.removeItem(draftKey); window.location.reload();
  };

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <Link to="/admin?tab=articles" className="inline-flex items-center gap-2 min-h-11 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Tutte le news</Link>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-2">
          <div><p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Redazione Epocar</p><h1 className="text-3xl sm:text-4xl font-headline">{isNew ? "Nuova notizia" : "Modifica notizia"}</h1></div>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2" role="status">{savedAt ? <><Check className="h-4 w-4" /> Copia locale · {savedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</> : "Le modifiche saranno visibili dopo il salvataggio."}</p>
        </div>
      </div>
    </header>
    <form onSubmit={handleSave} className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {error && <p role="alert" className="mb-6 border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {!initialized ? <p role="status">Caricamento notizia…</p> : <fieldset disabled={loading || loadFailed} className="min-w-0 grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 lg:gap-8">
        <section className="min-w-0 border border-border bg-card p-4 sm:p-6 space-y-6" aria-labelledby="article-content-title">
          <div><h2 id="article-content-title" className="font-headline text-2xl">Il racconto</h2><p className="text-sm text-muted-foreground mt-1">Titolo, sommario e testo della notizia.</p></div>
          <div className="space-y-2"><Label htmlFor="article-title">Titolo *</Label><Input id="article-title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Un titolo chiaro, che inviti a leggere" /></div>
          <div className="space-y-2"><Label htmlFor="article-summary">Sommario</Label><Textarea id="article-summary" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} rows={3} placeholder="La notizia in poche righe" /></div>
          <div className="space-y-2"><p className="text-sm font-medium">Contenuto</p><RichTextEditor disabled={loading || !initialized || loadFailed} content={form.content} onChange={content => setForm(previous => ({ ...previous, content }))} /></div>
        </section>
        <aside className="min-w-0 space-y-6">
          <section className="border border-border bg-card p-4 sm:p-5 space-y-4" aria-labelledby="article-publication-title">
            <div className="flex gap-2 items-center"><CalendarClock className="h-5 w-5" /><h2 id="article-publication-title" className="font-headline text-2xl">Pubblicazione</h2></div>
            <div className="space-y-2"><Label htmlFor="publication-mode">Quando va online?</Label><Select value={form.mode} onValueChange={mode => setForm({ ...form, mode: mode as PublicationMode, articleDate: mode !== "scheduled" && form.articleDate > today ? "" : form.articleDate })}><SelectTrigger id="publication-mode" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Salva come bozza</SelectItem><SelectItem value="now">Pubblica subito</SelectItem><SelectItem value="scheduled" disabled={!publicationInstalled}>Programma</SelectItem></SelectContent></Select></div>
            {form.mode === "scheduled" ? <div className="space-y-2"><Label htmlFor="article-schedule">Data e ora di uscita (Italia)</Label><Input id="article-schedule" type="datetime-local" required min={isoToRomeInput(new Date().toISOString())} value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} /><p className="text-xs text-muted-foreground leading-relaxed">Resta nascosta fino all’orario scelto, poi va online automaticamente.</p></div>
              : <div className="space-y-2"><Label htmlFor="article-date">Data mostrata nella notizia</Label><Input id="article-date" type="date" max={today} value={form.articleDate || today} disabled={!publicationInstalled} onChange={e => setForm({ ...form, articleDate: e.target.value })} /><p className="text-xs text-muted-foreground leading-relaxed">{form.articleDate ? "Data personalizzata. Puoi scegliere un giorno precedente." : "Automatica: usa il giorno in cui pubblichi, anche se prepari la bozza prima."}</p>{form.articleDate && <button type="button" className="min-h-11 text-xs underline underline-offset-4" onClick={() => setForm({ ...form, articleDate: "" })}>Usa il giorno di pubblicazione</button>}</div>}
            <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{form.mode === "draft" ? "La bozza non è visibile ai visitatori." : form.mode === "now" ? "La notizia sarà visibile appena salvi." : "Per annullare l’uscita, torna a «Salva come bozza»."}</p>
            {!publicationInstalled && <p role="status" className="text-xs leading-relaxed text-muted-foreground">La programmazione e la data personalizzata non sono ancora attive.</p>}
          </section>
          <section className="border border-border bg-card p-4 sm:p-5 space-y-4" aria-labelledby="article-cover-title">
            <h2 id="article-cover-title" className="font-headline text-2xl">Copertina</h2>
            {imagePreview ? <div className="relative"><img src={imagePreview} alt="Anteprima della copertina" className="w-full aspect-[4/3] object-cover" /><Button type="button" variant="secondary" size="icon" aria-label="Rimuovi copertina" className="absolute top-2 right-2 min-h-11 min-w-11" onClick={() => { setImageFile(null); setImagePreview(null); setForm({ ...form, image_url: "" }); }}><X className="h-4 w-4" /></Button></div> : null}
            <label htmlFor="article-image" className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed p-4 text-center text-sm ${dragging ? "border-accent bg-accent/5" : "border-border"}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); selectImage(e.dataTransfer.files[0]); }}><ImagePlus className="h-6 w-6" />{imagePreview ? "Sostituisci immagine" : "Scegli una foto o trascinala qui"}<input id="article-image" type="file" accept="image/*" className="block w-full max-w-full text-xs file:mr-2 file:border-0 file:bg-muted file:px-2 file:py-2 file:text-foreground" onChange={e => selectImage(e.target.files?.[0])} /></label>
          </section>
        </aside>
      </fieldset>}
      <div className="flex justify-end mt-4"><Button type="button" variant="ghost" className="min-h-11" onClick={discard} disabled={loading || loadFailed}>Scarta modifiche locali</Button></div>
      <div className="sticky bottom-0 z-10 mt-2 -mx-4 sm:mx-0 border-t border-border bg-background/95 p-4 sm:px-0 backdrop-blur flex flex-wrap gap-3 items-center">
        <Button type="submit" className="min-h-11 flex-1 sm:flex-none" disabled={!form.title.trim() || loading || !initialized || loadFailed}><Save className="h-4 w-4 mr-2" />{loading ? "Salvataggio…" : form.mode === "scheduled" ? "Salva programmazione" : form.mode === "now" ? "Salva e pubblica" : "Salva bozza"}</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => navigate("/admin?tab=articles")} disabled={loading}>Dashboard</Button>
      </div>
    </form>
  </div>;
}
