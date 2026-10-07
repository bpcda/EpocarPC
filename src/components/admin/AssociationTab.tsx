import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Download, Upload, Trash2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { associationClient, loadAssociation, publicAssociationFile, validateAssociationFile, submissionSchema, downloadMembership, type AssociationDocument, type Founder, type Submission } from "@/lib/association";

const founderInput = z.object({ name: z.string().trim().min(1, "Inserisci un nome").max(100), biography: z.string().trim().max(1000), sort_order: z.coerce.number().int().min(0).max(10000) });
export default function AssociationTab() {
  const { isAdmin } = useAuth();
  const [docs, setDocs] = useState<AssociationDocument[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [applications, setApplications] = useState<Submission[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Founder | null>(null);
  const [name, setName] = useState("");
  const [biography, setBiography] = useState("");
  const [order, setOrder] = useState("0");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoKey, setPhotoKey] = useState(0);
  const loadMaterials = async () => { const data = await loadAssociation(); setDocs(data.documents); setFounders(data.founders); };
  useEffect(() => { let active=true; setLoading(true); setError(false);
    Promise.all([loadAssociation(), associationClient.from("membership_applications").select("*", { count: "exact" }).order("created_at", { ascending:false }).order("id").range(page*20,page*20+19)])
      .then(([data,result]) => { if (!active) return; if (result.error) throw result.error; setDocs(data.documents);setFounders(data.founders);setApplications(z.array(submissionSchema).parse(result.data));setTotal(result.count || 0); })
      .catch(() => { if(active) setError(true); }).finally(() => {if(active)setLoading(false);});return () => {active=false;};
  }, [page]);
  async function uploadDocument(kind: "statute" | "membership_form", file: File) {
    if (!isAdmin || busy) return; setBusy(true); let path: string | null=null; let saved=false;
    try { const {ext,contentType}=validateAssociationFile(file);path=`${kind}/${crypto.randomUUID()}.${ext}`;
      const upload=await supabase.storage.from("association-documents").upload(path,file,{contentType});if(upload.error)throw upload.error;
      const previous=docs.find(d=>d.kind===kind);
      const save=await associationClient.from("association_documents").upsert({kind,path,filename:file.name.slice(0,255),updated_at:new Date().toISOString()});if(save.error)throw save.error;
      saved=true;await loadMaterials();setError(false);
      // Old immutable versions remain available: submissions reference the version read.
      toast.success(previous ? "Documento aggiornato" : "Documento pubblicato");
    } catch(err) { if(path && !saved)await supabase.storage.from("association-documents").remove([path]);toast.error(err instanceof Error ? err.message : "Caricamento non completato"); } finally {setBusy(false);}
  }
  async function removeDocument(doc: AssociationDocument) {
    if(!isAdmin || busy || !confirm("Ritirare il documento pubblico? Le nuove adesioni saranno sospese. Le richieste già ricevute resteranno disponibili."))return;
    setBusy(true);try {const result=await associationClient.from("association_documents").delete().eq("kind",doc.kind);if(result.error)throw result.error;await loadMaterials();toast.success("Documento ritirato");}catch {toast.error("Rimozione non completata");}finally{setBusy(false);}
  }
  function resetFounder() {setEditing(null);setName("");setBiography("");setOrder("0");setPhoto(null);setPhotoKey(k=>k+1);}
  async function saveFounder(event: FormEvent) {
    event.preventDefault();if(!isAdmin || busy)return;const parsed=founderInput.safeParse({name,biography,sort_order:order});if(!parsed.success){toast.error(parsed.error.issues[0]?.message);return;}
    setBusy(true);let uploaded:string|null=null;let saved=false;
    try {let photo_path=editing?.photo_path || null;
      if(photo){const {ext,contentType}=validateAssociationFile(photo,true);uploaded=`founders/${crypto.randomUUID()}.${ext}`;const upload=await supabase.storage.from("association-media").upload(uploaded,photo,{contentType});if(upload.error)throw upload.error;photo_path=uploaded;}
      const payload={...parsed.data,photo_path};const result=editing ? await associationClient.from("association_founders").update(payload).eq("id",editing.id) : await associationClient.from("association_founders").insert(payload);
      if(result.error)throw result.error;saved=true;
      if(uploaded && editing?.photo_path)await supabase.storage.from("association-media").remove([editing.photo_path]);
      resetFounder();await loadMaterials();setError(false);toast.success("Fondatore salvato");
    }catch {if(uploaded && !saved)await supabase.storage.from("association-media").remove([uploaded]);toast.error("Salvataggio non completato");}finally{setBusy(false);}
  }
  async function removeFounder(founder:Founder){
    if(!isAdmin || busy || !confirm(`Rimuovere ${founder.name} dalla pagina dei fondatori?`))return;setBusy(true);
    try{const result=await associationClient.from("association_founders").delete().eq("id",founder.id);if(result.error)throw result.error;if(founder.photo_path)await supabase.storage.from("association-media").remove([founder.photo_path]);if(editing?.id===founder.id)resetFounder();await loadMaterials();toast.success("Fondatore rimosso");}catch{toast.error("Rimozione non completata");}finally{setBusy(false);}
  }
  return <div className="space-y-10">
    <div><h2 className="text-3xl mb-2">Associazione</h2><p className="text-sm text-muted-foreground">Percorso ETS in preparazione · le adesioni si aprono quando statuto e modulo sono pubblicati.</p></div>
    {error && <div role="alert" className="border border-border py-5 px-4"><p className="mb-3">La sezione non è disponibile. Verifica che la tua istanza sia stata configurata.</p>{isAdmin && <Button variant="outline" asChild><a href="/setup/association.sql" download><Download /> SQL di installazione</a></Button>}</div>}
    <section className="border-t border-border pt-6"><h3 className="text-2xl mb-4">Documenti pubblici</h3>
      <div className="divide-y divide-border">{([['statute','Statuto'],['membership_form','Modulo di adesione']] as const).map(([kind,label])=>{const doc=docs.find(d=>d.kind===kind);return <div key={kind} className="flex flex-wrap items-center gap-3 py-4"><div className="flex-1 min-w-[180px]"><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground break-all">{doc ? doc.filename : "Non ancora pubblicato"}</p></div>
        {doc && <Button variant="outline" size="sm" asChild><a href={publicAssociationFile("association-documents",doc.path)} target="_blank" rel="noopener noreferrer"><Download /> Scarica</a></Button>}
        {isAdmin && <><Label htmlFor={`doc-${kind}`} className={`inline-flex items-center gap-2 border border-border px-3 py-2 cursor-pointer ${busy ? "opacity-50" : ""}`}><Upload className="h-4 w-4" />{doc ? "Sostituisci" : "Carica"}</Label><Input id={`doc-${kind}`} aria-label={`Carica ${label}`} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" disabled={busy} className="sr-only" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadDocument(kind,file);e.target.value="";}} />{doc && <Button variant="ghost" size="icon" title={`Ritira ${label}`} aria-label={`Ritira ${label}`} disabled={busy} onClick={()=>removeDocument(doc)}><Trash2 /></Button>}</>}
      </div>;})}</div>
      {isAdmin && <p className="text-xs text-muted-foreground mt-3">Pubblica soltanto documenti approvati. Il modulo deve contenere l’informativa sul trattamento dei dati personali. Massimo 10 MB per file.</p>}
    </section>
    <section className="border-t border-border pt-6"><h3 className="text-2xl mb-4">I fondatori</h3>
      {founders.length===0 && <p className="text-sm text-muted-foreground mb-5">Nessun fondatore pubblicato.</p>}
      {founders.map(f=><div key={f.id} className="flex items-center gap-3 py-3 border-b border-border"><p className="flex-1 break-words">{f.name}</p>{isAdmin && <><Button variant="ghost" size="icon" title={`Modifica ${f.name}`} aria-label={`Modifica ${f.name}`} disabled={busy} onClick={()=>{setEditing(f);setName(f.name);setBiography(f.biography);setOrder(String(f.sort_order));setPhoto(null);setPhotoKey(k=>k+1);}}><Pencil /></Button><Button variant="ghost" size="icon" title={`Rimuovi ${f.name}`} aria-label={`Rimuovi ${f.name}`} disabled={busy} onClick={()=>removeFounder(f)}><Trash2 /></Button></>}</div>)}
      {isAdmin && <form onSubmit={saveFounder} className="mt-6 max-w-2xl space-y-4"><h4 className="text-xl">{editing ? "Modifica fondatore" : "Aggiungi fondatore"}</h4><div className="grid sm:grid-cols-[1fr_100px] gap-4"><div><Label htmlFor="founder-name">Nome e cognome</Label><Input id="founder-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></div><div><Label htmlFor="founder-order">Ordine</Label><Input id="founder-order" type="number" min={0} max={10000} value={order} onChange={e=>setOrder(e.target.value)} /></div></div><div><Label htmlFor="founder-bio">Presentazione</Label><Textarea id="founder-bio" maxLength={1000} value={biography} onChange={e=>setBiography(e.target.value)} /></div><div><Label htmlFor="founder-photo">Foto (facoltativa)</Label><Input key={photoKey} id="founder-photo" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e=>setPhoto(e.target.files?.[0] || null)} /></div><div className="flex gap-3"><Button disabled={busy} type="submit">{busy ? "Salvataggio…" : "Salva fondatore"}</Button>{editing && <Button disabled={busy} variant="outline" type="button" onClick={resetFounder}>Annulla</Button>}</div></form>}
    </section>
    <section className="border-t border-border pt-6"><h3 className="text-2xl mb-4">Richieste di adesione <span className="text-muted-foreground">({total})</span></h3>
      {loading ? <p role="status">Caricamento…</p> : !applications.length ? <p className="text-muted-foreground text-sm">{error ? "Richieste non disponibili." : "Nessuna richiesta ricevuta."}</p> : <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Ricevuta il</TableHead><TableHead>Modulo</TableHead></TableRow></TableHeader><TableBody>{applications.map(a=><TableRow key={a.id}><TableCell>{a.full_name}</TableCell><TableCell>{a.email}</TableCell><TableCell>{new Date(a.created_at).toLocaleDateString("it-IT")}</TableCell><TableCell><Button size="sm" variant="outline" onClick={()=>downloadMembership(a.file_path,a.filename).catch(e=>toast.error(e.message))}><Download /> Scarica</Button></TableCell></TableRow>)}</TableBody></Table>}
      {total>20 && <div className="flex items-center gap-4 mt-4"><Button variant="outline" size="icon" aria-label="Pagina precedente" disabled={page===0 || loading} onClick={()=>setPage(p=>p-1)}><ChevronLeft /></Button><span className="text-sm">Pagina {page+1} di {Math.ceil(total/20)}</span><Button variant="outline" size="icon" aria-label="Pagina successiva" disabled={(page+1)*20>=total || loading} onClick={()=>setPage(p=>p+1)}><ChevronRight /></Button></div>}
    </section>
  </div>;
}