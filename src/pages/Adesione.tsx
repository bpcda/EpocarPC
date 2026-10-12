import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileDown, Send, CheckCircle2, ArrowLeft, ArrowRight, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  associationClient, loadAssociation, submissionSchema, publicAssociationFile, downloadMembership, APPLICATION_STATUS,
  personalStep, associativeStep, declarationsStep, stepErrors, emptyForm, formFromRow, electronicPayload, applicantPayload,
  DECLARATIONS, REQUESTED_CATEGORIES, DECLARATIONS_VERSION,
  type AssociationDocument, type Submission, type ApplicationForm,
} from "@/lib/association";

const STEPS = ["Dati personali", "Dati associativi", "Dichiarazioni", "Riepilogo"] as const;
const FORMAL_TEXT = "Con l’invio della presente domanda chiedo di essere ammesso/a in qualità di socio dell’Associazione EPOCAR, dichiarando di conoscere e accettare lo Statuto e gli eventuali regolamenti associativi. La domanda sarà sottoposta alla procedura di ammissione prevista dall’Associazione.";
const inputCls = "mt-2 bg-primary-foreground text-foreground";
type Row = Record<string, unknown>;

const PERSONAL: [keyof ApplicationForm, string, string?, string?][] = [
  ["first_name", "Nome", "text", "given-name"], ["last_name", "Cognome", "text", "family-name"],
  ["birth_date", "Data di nascita", "date", "bday"], ["birth_place", "Luogo di nascita", "text"],
  ["tax_code", "Codice fiscale", "text"], ["email", "Email", "email", "email"],
  ["phone", "Telefono", "tel", "tel"], ["address", "Indirizzo", "text", "street-address"],
  ["postal_code", "CAP", "text", "postal-code"], ["city", "Comune", "text", "address-level2"],
  ["province", "Provincia (sigla)", "text", "address-level1"],
];

export default function Adesione() {
  const { user, loading: authLoading } = useAuth();
  const [docs, setDocs] = useState<AssociationDocument[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [form, setForm] = useState<ApplicationForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  const [reload, setReload] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (authLoading) return; let active = true; setLoading(true); setUnavailable(false); setSubmission(null); setRow(null);
    Promise.all([
      // Documents are optional: their absence never blocks the electronic application.
      loadAssociation().catch((e) => { console.error("[Adesione] documenti non disponibili", e); return { documents: [] as Doc[] }; }),
      user ? associationClient.from("membership_applications").select("*").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      user ? supabase.from("profiles").select("first_name,last_name,phone,city").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]).then(([materials, application, profile]) => {
      if (!active) return; if (application.error) throw application.error;
      setDocs(materials.documents);
      const base = { ...emptyForm(), email: user?.email ?? "", first_name: profile.data?.first_name ?? "", last_name: profile.data?.last_name ?? "", phone: profile.data?.phone ?? "", city: profile.data?.city ?? "" };
      const data = application.data as Row | null;
      setRow(data); setSubmission(data ? submissionSchema.parse(data) : null);
      setForm(data?.status === "draft" ? formFromRow(data, base) : base);
    }).catch((e) => { console.error("[Adesione] lettura domanda non riuscita", e); if (active) setUnavailable(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, authLoading, reload]);

  const statute = docs.find(d => d.kind === "statute");
  const moduleDoc = docs.find(d => d.kind === "membership_form");
  const ready = !unavailable;
  const isDraft = submission?.status === "draft";
  const set = (k: keyof ApplicationForm, v: string | boolean) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => { const n = { ...e }; delete n[k]; return n; }); };

  async function persist(status: "draft" | "submitted") {
    if (!user || busy.current || (submission && !isDraft)) return false;
    busy.current = true; setSending(true);
    try {
      const fields = applicantPayload(electronicPayload(form, status, row));
      const result = isDraft
        ? await associationClient.from("membership_applications").update(fields).eq("id", submission!.id).eq("status", "draft").select("*").single()
        : await associationClient.from("membership_applications").insert({ user_id: user.id, ...fields, acknowledged: true, statute_path: statute?.path ?? null, form_path: moduleDoc?.path ?? null }).select("*").single();
      if (result.error) {
        const existing = await associationClient.from("membership_applications").select("*").eq("user_id", user.id).maybeSingle();
        if (existing.data) { setRow(existing.data); setSubmission(submissionSchema.parse(existing.data)); }
        throw result.error;
      }
      setRow(result.data); setSubmission(submissionSchema.parse(result.data));
      return true;
    } catch {
      toast.error(status === "draft" ? "Salvataggio bozza non riuscito. Riprova più tardi." : "Invio non completato. Controlla i dati o verifica se la domanda risulta già inviata.");
      return false;
    } finally { busy.current = false; setSending(false); }
  }

  const schemas = [personalStep, associativeStep, declarationsStep];
  function next() {
    const e = stepErrors(schemas[step], form); setErrors(e);
    if (Object.keys(e).length) { toast.error("Controlla i campi evidenziati"); return; }
    setStep(s => s + 1); window.scrollTo({ top: 0 });
  }
  async function saveDraft() { if (await persist("draft")) toast.success("Bozza salvata: potrai riprenderla quando vuoi"); }
  async function submit() {
    for (let i = 0; i < schemas.length; i++) { const e = stepErrors(schemas[i], form); if (Object.keys(e).length) { setErrors(e); setStep(i); toast.error("Completa i campi obbligatori"); return; } }
    if (await persist("submitted")) toast.success("Domanda ricevuta");
  }

  const err = (k: string) => errors[k] && <p id={`${k}-err`} className="text-sm mt-1 text-primary-foreground underline decoration-dotted">{errors[k]}</p>;
  const sent = submission && !isDraft;
  const v = (k: string) => (row?.[k] as string | null | undefined) ?? null;

  return <><PageMeta title="Domanda di ammissione — Epocar" description="Presenta la domanda di ammissione a socio dell’Associazione EPOCAR." path="/associazione/iscrizione" /><Navbar />
    <main className="min-h-screen bg-foreground text-primary-foreground pt-28 pb-20">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <Link to="/associazione" className="inline-flex items-center gap-2 text-sm text-primary-foreground/70 mb-8 print:hidden"><ArrowLeft className="w-4 h-4" /> L’associazione</Link>
        <h1 className="text-5xl md:text-7xl mb-6">Domanda di ammissione</h1>
        <p className="max-w-2xl text-primary-foreground/75 leading-relaxed mb-10">È una richiesta: la qualità di socio si acquisisce solo dopo la procedura di ammissione prevista dall’Associazione. La domanda è distinta dall’iscrizione agli eventi.</p>

        {loading || authLoading ? <p role="status">Caricamento…</p> : sent ? (
          <section className="border-y border-primary-foreground/25 py-8">
            <CheckCircle2 className="h-8 w-8 mb-4 print:hidden" />
            <h2 className="text-3xl mb-3">{submission.status === "submitted" ? "Domanda ricevuta" : APPLICATION_STATUS[submission.status]}</h2>
            {submission.status === "submitted" && <p className="text-primary-foreground/75 mb-6">La tua domanda è stata trasmessa all’Associazione e sarà esaminata secondo la procedura prevista. Puoi controllarne lo stato dalla tua Area Socio.</p>}
            {submission.public_status_message && <p className="text-primary-foreground/75 mb-6">{submission.public_status_message}</p>}
            {v("application_kind") === "electronic" && <dl className="text-sm mb-6 space-y-1" aria-label="Copia della domanda">
              <div><dt className="inline text-primary-foreground/60">Domanda n. </dt><dd className="inline font-mono">{submission.id}</dd></div>
              <div><dt className="inline text-primary-foreground/60">Presentata il </dt><dd className="inline">{new Date(submission.submitted_at ?? submission.created_at).toLocaleString("it-IT")}</dd></div>
              <div><dt className="inline text-primary-foreground/60">Richiedente: </dt><dd className="inline">{v("first_name")} {v("last_name")} · nato/a a {v("birth_place")} il {v("birth_date") && new Date(v("birth_date")!).toLocaleDateString("it-IT")} · C.F. {v("tax_code")}</dd></div>
              <div><dt className="inline text-primary-foreground/60">Residenza: </dt><dd className="inline">{v("address")}, {v("postal_code")} {v("city")} ({v("province")})</dd></div>
              <div><dt className="inline text-primary-foreground/60">Contatti: </dt><dd className="inline">{v("email")} · {v("phone")}</dd></div>
              <div><dt className="inline text-primary-foreground/60">Categoria richiesta: </dt><dd className="inline">{v("requested_category")}</dd></div>
              <div className="pt-2"><dt className="text-primary-foreground/60">Dichiarazioni (versione {v("declarations_version")}):</dt><dd><ul className="list-disc pl-5">{DECLARATIONS.filter(d => v(d.key)).map(d => <li key={d.key}>{d.label}</li>)}</ul></dd></div>
              <div className="pt-2"><dt className="inline text-primary-foreground/60">Stato: </dt><dd className="inline">Domanda presentata</dd></div>
            </dl>}
            <div className="flex flex-wrap gap-3 print:hidden">
              <Button variant="hero-primary" asChild><Link to="/account?tab=socio">Vai alla tua Area Socio</Link></Button>
              {v("application_kind") === "electronic" && <Button variant="hero-secondary" onClick={() => window.print()}><Printer /> Stampa la domanda</Button>}
              {submission.file_path && <Button variant="hero-secondary" onClick={() => downloadMembership(submission.file_path!, submission.filename ?? "modulo").catch(e => toast.error(e.message))}><FileDown /> Il tuo modulo</Button>}
            </div>
          </section>
        ) : <>
          {!ready && <div role="status" className="border-y border-primary-foreground/25 py-8 mb-10"><h2 className="text-3xl mb-3">Adesioni non ancora aperte</h2><p className="text-primary-foreground/70">{unavailable ? "I documenti non sono al momento disponibili. Riprova più tardi." : "Lo statuto e il modulo di adesione saranno pubblicati qui quando saranno pronti."}</p></div>}
          <section className="mb-10"><h2 className="text-3xl mb-5">Documenti dell’associazione</h2><div className="flex flex-wrap gap-4">{([["statute", "Lo statuto"], ["membership_form", "Modulo e informativa"]] as const).map(([kind, label]) => { const doc = docs.find(d => d.kind === kind); return doc ? <Button key={kind} variant="hero-secondary" asChild><a href={publicAssociationFile("association-documents", doc.path)} target="_blank" rel="noopener noreferrer"><FileDown /> {label}</a></Button> : <span key={kind} className="text-sm text-primary-foreground/50 border border-primary-foreground/20 px-4 py-3">{label} · non disponibile</span>; })}</div></section>
          {ready && !user && <Button variant="hero-primary" asChild><Link to="/auth?next=/associazione/iscrizione">Accedi per presentare la domanda</Link></Button>}
          {ready && user && <section className="border-t border-primary-foreground/25 pt-8" aria-label="Modulo di domanda">
            <ol className="grid grid-cols-4 gap-1 mb-8" aria-label="Avanzamento">{STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={`border-t-4 pt-2 text-xs sm:text-sm uppercase tracking-widest ${i <= step ? "border-primary-foreground" : "border-primary-foreground/20 text-primary-foreground/50"}`}><span className="hidden sm:inline">{i + 1}. {s}</span><span className="sm:hidden">{i + 1}</span></li>)}</ol>
            <h2 className="text-3xl mb-2">{STEPS[step]}</h2>
            <p className="text-sm text-primary-foreground/60 mb-6">{isDraft ? "Stato: Bozza · " : ""}I campi con * sono obbligatori.</p>

            {step === 0 && <div className="grid sm:grid-cols-2 gap-5">{PERSONAL.map(([k, label, type, ac]) => <div key={k}><Label htmlFor={`f-${k}`}>{label} *</Label><Input id={`f-${k}`} type={type} autoComplete={ac} value={form[k] as string} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${k}-err` : undefined} onChange={e => set(k, e.target.value)} className={inputCls} maxLength={k === "tax_code" ? 16 : k === "province" ? 2 : 120} />{err(k)}</div>)}</div>}

            {step === 1 && <div className="space-y-6">
              <fieldset><legend className="mb-3">Categoria di socio richiesta *</legend><div className="flex flex-wrap gap-3">{REQUESTED_CATEGORIES.map(c => <label key={c} className={`border px-5 py-3 cursor-pointer ${form.requested_category === c ? "bg-primary-foreground text-foreground" : "border-primary-foreground/40"}`}><input type="radio" name="category" value={c} checked={form.requested_category === c} onChange={() => set("requested_category", c)} className="sr-only" />{c}</label>)}</div>
                <p className="text-sm text-primary-foreground/60 mt-2">La categoria definitiva è deliberata dall’Associazione in sede di ammissione.</p>{err("requested_category")}</fieldset>
              <div><Label htmlFor="f-motivation">Perché vuoi entrare in EPOCAR? (facoltativo)</Label><Textarea id="f-motivation" maxLength={1000} value={form.motivation} onChange={e => set("motivation", e.target.value)} className={inputCls} placeholder="Interessi, veicoli d’epoca posseduti o seguiti…" />{err("motivation")}</div>
              <div><Label htmlFor="f-notes">Note (facoltativo)</Label><Textarea id="f-notes" maxLength={1000} value={form.applicant_notes} onChange={e => set("applicant_notes", e.target.value)} className={inputCls} />{err("applicant_notes")}</div>
            </div>}

            {step === 2 && <div className="space-y-5">{DECLARATIONS.map(d => <div key={d.key}><div className="flex items-start gap-3"><Checkbox id={`f-${d.key}`} checked={form[d.key]} onCheckedChange={c => set(d.key, c === true)} aria-invalid={!!errors[d.key]} className="mt-0.5 border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-foreground" /><Label htmlFor={`f-${d.key}`} className="leading-relaxed">{d.label}{d.required ? " *" : ""}</Label></div>{err(d.key)}</div>)}</div>}

            {step === 3 && <div className="space-y-4">
              <dl className="grid sm:grid-cols-2 gap-x-6 text-sm">{PERSONAL.map(([k, label]) => <div key={k} className="border-b border-primary-foreground/15 py-2"><dt className="text-primary-foreground/60">{label}</dt><dd>{k === "birth_date" && form.birth_date ? new Date(form.birth_date).toLocaleDateString("it-IT") : (form[k] as string)}</dd></div>)}
                <div className="border-b border-primary-foreground/15 py-2"><dt className="text-primary-foreground/60">Categoria richiesta</dt><dd>{form.requested_category}</dd></div></dl>
              {form.motivation && <p className="text-sm"><span className="text-primary-foreground/60">Motivazione: </span>{form.motivation}</p>}
              {form.applicant_notes && <p className="text-sm"><span className="text-primary-foreground/60">Note: </span>{form.applicant_notes}</p>}
              <ul className="text-sm list-disc pl-5">{DECLARATIONS.filter(d => form[d.key]).map(d => <li key={d.key}>{d.label}</li>)}</ul>
              <p className="border-l-4 border-primary-foreground pl-4 leading-relaxed">{FORMAL_TEXT}</p>
              <p className="text-xs text-primary-foreground/50">Dichiarazioni versione {DECLARATIONS_VERSION}. Dopo l’invio i dati non saranno più modificabili dal sito.</p>
            </div>}

            <div className="flex flex-wrap gap-3 mt-8 sticky bottom-0 bg-foreground py-4 border-t border-primary-foreground/15">
              {step > 0 && <Button type="button" variant="hero-secondary" disabled={sending} onClick={() => setStep(s => s - 1)}><ArrowLeft /> Indietro</Button>}
              {step < 3 ? <Button type="button" variant="hero-primary" disabled={sending} onClick={next}>Avanti <ArrowRight /></Button>
                : <Button type="button" variant="hero-primary" disabled={sending} onClick={submit}><Send /> {sending ? "Invio in corso…" : "Invia domanda di ammissione"}</Button>}
              <Button type="button" variant="hero-secondary" disabled={sending} onClick={saveDraft}><Save /> Salva bozza</Button>
            </div>
          </section>}
        </>}
      </div>
    </main><Footer /></>;
}
