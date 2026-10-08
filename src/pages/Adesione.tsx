import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FileDown, Send, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { associationClient, loadAssociation, membershipSchema, submissionSchema, validateAssociationFile, publicAssociationFile, downloadMembership, APPLICATION_STATUS, type AssociationDocument, type Submission } from "@/lib/association";

export default function Adesione() {
  const { user, loading: authLoading } = useAuth();
  const [docs, setDocs] = useState<AssociationDocument[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => { if (authLoading) return; let active = true; setLoading(true); setUnavailable(false); setSubmission(null);
    Promise.all([loadAssociation(), user ? associationClient.from("membership_applications").select("*").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null })])
      .then(([materials, application]) => { if (!active) return; if (application.error) throw application.error; setDocs(materials.documents); const sub = application.data ? submissionSchema.parse(application.data) : null; setSubmission(sub); setEmail(sub?.status === "draft" ? sub.email : user?.email || ""); if (sub?.status === "draft") setFullName(sub.full_name); })
      .catch(() => { if (active) setUnavailable(true); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, [user?.id, authLoading]);
  const statute = docs.find(d => d.kind === "statute");
  const form = docs.find(d => d.kind === "membership_form");
  const ready = Boolean(statute && form && !unavailable);
  const isDraft = submission?.status === "draft";
  async function saveDraft() {
    if (!user || !statute || !form || sending || (submission && !isDraft)) return;
    const values = membershipSchema.pick({ full_name: true, email: true }).safeParse({ full_name: fullName, email });
    if (!values.success) { toast.error(values.error.issues[0]?.message); return; }
    setSending(true);
    try {
      const result = isDraft
        ? await associationClient.from("membership_applications").update({ ...values.data }).eq("id", submission!.id).select("*").single()
        : await associationClient.from("membership_applications").insert({ user_id: user.id, ...values.data, acknowledged: true, status: "draft", statute_path: statute.path, form_path: form.path }).select("*").single();
      if (result.error) throw result.error;
      setSubmission(submissionSchema.parse(result.data)); toast.success("Bozza salvata: potrai completarla e inviarla più tardi");
    } catch { toast.error("Salvataggio bozza non riuscito. Riprova più tardi."); } finally { setSending(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!user || !statute || !form || sending || (submission && !isDraft) || unavailable) return;
    const values = membershipSchema.safeParse({ full_name: fullName, email, acknowledged });
    if (!values.success) { toast.error(values.error.issues[0]?.message); return; }
    if (!file) { toast.error("Allega il modulo compilato."); return; }
    let path: string | null = null; let saved = false; setSending(true);
    try {
      const { ext, contentType } = validateAssociationFile(file);
      path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from("membership-submissions").upload(path, file, { contentType, upsert: false });
      if (upload.error) throw upload.error;
      const fields = { ...values.data, file_path: path, filename: file.name.slice(0,255), status: "submitted" };
      const result = isDraft
        ? await associationClient.from("membership_applications").update(fields).eq("id", submission!.id).select("*").single()
        : await associationClient.from("membership_applications").insert({ user_id: user.id, ...fields, statute_path: statute.path, form_path: form.path }).select("*").single();
      if (result.error) {
        if (result.error.code === "23505") { const existing = await associationClient.from("membership_applications").select("*").eq("user_id",user.id).maybeSingle(); if (existing.data) setSubmission(submissionSchema.parse(existing.data)); }
        throw result.error;
      }
      saved = true; setSubmission(submissionSchema.parse(result.data)); setFile(null); toast.success("Domanda di ammissione inviata");
    } catch { if (path && !saved) await supabase.storage.from("membership-submissions").remove([path]); toast.error("Invio non completato. Verifica se la richiesta risulta già inviata e riprova più tardi."); }
    finally { setSending(false); }
  }
  return <><PageMeta title="Diventa socio — Epocar" description="Scarica il modulo di adesione a Epocar e invia la tua richiesta di iscrizione all’associazione." path="/associazione/iscrizione" /><Navbar />
    <main className="min-h-screen bg-foreground text-primary-foreground pt-28 pb-20">
      <div className="max-w-4xl mx-auto px-6">
        <Link to="/associazione" className="inline-flex items-center gap-2 text-sm text-primary-foreground/70 mb-8"><ArrowLeft className="w-4 h-4" /> L’associazione</Link>
        <h1 className="text-5xl md:text-7xl mb-6">Diventa socio Epocar</h1>
        <p className="max-w-2xl text-primary-foreground/75 leading-relaxed mb-10">La richiesta di adesione all’associazione è distinta dall’iscrizione agli eventi. Il suo invio non comporta l’ammissione automatica come socio.</p>
        {loading || authLoading ? <p role="status">Caricamento…</p> : submission && !isDraft ? <section className="border-y border-primary-foreground/25 py-8"><CheckCircle2 className="h-8 w-8 mb-4" /><h2 className="text-3xl mb-3">Domanda: {APPLICATION_STATUS[submission.status]}</h2><p className="text-primary-foreground/75 mb-6">Inviata il {new Date(submission.created_at).toLocaleDateString("it-IT")}. {submission.status === "approved" ? "Il Consiglio Direttivo ha approvato la tua ammissione: sei socio Epocar." : submission.status === "rejected" ? "Il Consiglio Direttivo non ha accolto la domanda." : "La qualità di socio si acquisisce solo con l’approvazione del Consiglio Direttivo."}</p>{submission.file_path && <Button variant="hero-secondary" onClick={() => downloadMembership(submission.file_path!, submission.filename ?? "modulo").catch(e => toast.error(e.message))}><FileDown /> Il tuo modulo</Button>}</section> : <>
          {!ready && <div role="status" className="border-y border-primary-foreground/25 py-8 mb-10"><h2 className="text-3xl mb-3">Adesioni non ancora aperte</h2><p className="text-primary-foreground/70">{unavailable ? "I documenti non sono al momento disponibili. Riprova più tardi." : "Lo statuto e il modulo di adesione saranno pubblicati qui quando saranno pronti."}</p></div>}
          <section className="mb-10"><h2 className="text-3xl mb-5">Documenti dell’associazione</h2><div className="flex flex-wrap gap-4">{([['statute','Lo statuto'],['membership_form','Modulo di adesione']] as const).map(([kind,label]) => { const doc = docs.find(d => d.kind===kind); return doc ? <Button key={kind} variant="hero-secondary" asChild><a href={publicAssociationFile("association-documents",doc.path)} target="_blank" rel="noopener noreferrer"><FileDown /> {label}</a></Button> : <span key={kind} className="text-sm text-primary-foreground/50 border border-primary-foreground/20 px-4 py-3">{label} · non disponibile</span>; })}</div></section>
          {ready && !user && <Button variant="hero-primary" asChild><Link to="/auth?next=/associazione/iscrizione">Accedi per inviare la richiesta</Link></Button>}
          {ready && user && <form onSubmit={submit} className="border-t border-primary-foreground/25 pt-8 space-y-6"><h2 className="text-3xl">Richiesta di adesione</h2>
            <div className="grid sm:grid-cols-2 gap-5"><div><Label htmlFor="member-name">Nome e cognome</Label><Input id="member-name" required maxLength={100} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} className="mt-2 bg-primary-foreground text-foreground" /></div><div><Label htmlFor="member-email">Email</Label><Input id="member-email" type="email" required maxLength={255} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 bg-primary-foreground text-foreground" /></div></div>
            <div><Label htmlFor="member-file">Modulo compilato e firmato</Label><Input id="member-file" type="file" required accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" onChange={e => { const selected=e.target.files?.[0]; if (!selected) {setFile(null);return;} try {validateAssociationFile(selected);setFile(selected);} catch(err) {setFile(null);e.target.value="";toast.error(err instanceof Error ? err.message : "File non valido");} }} className="mt-2 bg-primary-foreground text-foreground" /><p className="text-sm text-primary-foreground/60 mt-2">PDF, DOCX, JPG, PNG o WebP · massimo 10 MB</p></div>
            <div className="flex items-start gap-3"><Checkbox id="member-ack" checked={acknowledged} onCheckedChange={v => setAcknowledged(v===true)} className="border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-foreground" /><Label htmlFor="member-ack" className="leading-relaxed">Ho preso visione dello statuto e presento la richiesta di adesione all’associazione.</Label></div>
            <p className="text-sm text-primary-foreground/65">Il documento sarà accessibile a te e ai membri autorizzati dell’organizzazione. Le informazioni sul trattamento dei dati dovranno essere contenute nel modulo di adesione.</p>
            {isDraft && <p className="text-sm text-primary-foreground/75">Stato: Bozza · allega il modulo firmato e invia quando sei pronto.</p>}
            <div className="flex flex-wrap gap-3"><Button type="submit" variant="hero-primary" disabled={sending}><Send /> {sending ? "Invio in corso…" : "Invia domanda"}</Button><Button type="button" variant="hero-secondary" disabled={sending} onClick={saveDraft}>Salva bozza</Button></div>
          </form>}
        </>}
      </div>
    </main><Footer /></>;
}