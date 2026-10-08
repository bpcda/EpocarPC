import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { associationClient, loadAssociation, loadPeople, personName, boardRole, BOARD_ROLES, publicAssociationFile, validateAssociationFile, submissionSchema, downloadMembership, type AssociationDocument, type PersonWithPhoto, type Submission } from "@/lib/association";

export default function AssociationTab() {
  const { isAdmin } = useAuth();
  const [docs, setDocs] = useState<AssociationDocument[]>([]);
  const [people, setPeople] = useState<PersonWithPhoto[]>([]);
  const [orders, setOrders] = useState<Record<string,string>>({});
  const [applications, setApplications] = useState<Submission[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadMaterials = async () => { const data = await loadAssociation(); setDocs(data.documents); };
  const loadAllPeople = async () => { try { const list = await loadPeople(); setPeople(list); setOrders(Object.fromEntries(list.map(p=>[p.user_id,String(p.sort_order)]))); } catch { setPeople([]); } };
  useEffect(() => { void loadAllPeople(); }, []);
  useEffect(() => { let active=true; setLoading(true); setError(false);
    Promise.all([loadAssociation(), associationClient.from("membership_applications").select("*", { count: "exact" }).order("created_at", { ascending:false }).order("id").range(page*20,page*20+19)])
      .then(([data,result]) => { if (!active) return; if (result.error) throw result.error; setDocs(data.documents);setApplications(z.array(submissionSchema).parse(result.data));setTotal(result.count || 0); })
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
  async function saveOrder(person: PersonWithPhoto) {
    const value=Number(orders[person.user_id]);if(!isAdmin||busy)return;
    if(!Number.isInteger(value)||value<0||value>10000){toast.error("Ordine tra 0 e 10000");return;}
    setBusy(true);try{const r=await associationClient.from("association_people_order").upsert({user_id:person.user_id,sort_order:value,updated_at:new Date().toISOString()});if(r.error)throw r.error;await loadAllPeople();toast.success("Ordine salvato");}catch{toast.error("Salvataggio non completato");}finally{setBusy(false);}
  }
  return <div className="space-y-10">
    <div><h2 className="text-3xl mb-2">Associazione</h2><p className="text-sm text-muted-foreground">Percorso ETS in preparazione · le adesioni si aprono quando statuto e modulo sono pubblicati.</p></div>
    {error && <div role="alert" className="border border-border py-5 px-4"><p className="mb-3">La sezione non è disponibile. Verifica che la tua istanza sia stata configurata.</p>{isAdmin && <Button variant="outline" asChild><a href="/setup/association.sql" download><Download /> SQL di installazione</a></Button>}</div>}
    <section className="border-t border-border pt-6"><h3 className="text-2xl mb-4">Documenti pubblici</h3>
      <div className="divide-y divide-border">{([['statute','Statuto'],['membership_form','Modulo di adesione']] as const).map(([kind,label])=>{const doc=docs.find(d=>d.kind===kind);return <div key={kind} className="flex flex-wrap items-center gap-3 py-4"><div className="flex-1 min-w-[180px]"><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground break-all">{doc ? doc.filename : "Non ancora pubblicato"}</p></div>
        {doc && <Button variant="outline" size="sm" asChild><a href={publicAssociationFile("association-documents",doc.path)} target="_blank" rel="noopener noreferrer"><Download /> Scarica</a></Button>}
        {isAdmin && <><Button variant="outline" size="sm" disabled={busy} onClick={()=>document.getElementById(`doc-${kind}`)?.click()}><Upload />{doc ? "Sostituisci" : "Carica"}</Button><Input id={`doc-${kind}`} aria-label={`Carica ${label}`} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" disabled={busy} className="sr-only" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadDocument(kind,file);e.target.value="";}} />{doc && <Button variant="ghost" size="icon" title={`Ritira ${label}`} aria-label={`Ritira ${label}`} disabled={busy} onClick={()=>removeDocument(doc)}><Trash2 /></Button>}</>}
      </div>;})}</div>
      {isAdmin && <p className="text-xs text-muted-foreground mt-3">Pubblica soltanto documenti approvati. Il modulo deve contenere l’informativa sul trattamento dei dati personali. Massimo 10 MB per file.</p>}
    </section>
    <section className="border-t border-border pt-6"><h3 className="text-2xl mb-2">Fondatori e consiglio direttivo</h3>
      <p className="text-sm text-muted-foreground mb-4">Le persone arrivano dai ruoli assegnati in Utenti (fondatore, presidente, vicepresidente, segretario, consigliere). Qui puoi cambiare solo l’ordine di visualizzazione: numero più basso, prima posizione.</p>
      {people.length===0 && <p className="text-sm text-muted-foreground">Nessuna persona con questi ruoli.</p>}
      {people.map(p=>{const board=boardRole(p);return <div key={p.user_id} className="flex flex-wrap items-center gap-3 py-3 border-b border-border">
        <div className="flex-1 min-w-[180px]"><p className="break-words">{personName(p)}</p><p className="text-xs text-muted-foreground">{[p.roles.includes("founder")?"Fondatore":null,board?BOARD_ROLES[board]:null].filter(Boolean).join(" · ")}</p></div>
        {isAdmin ? <><Input aria-label={`Ordine di ${personName(p)}`} type="number" min={0} max={10000} className="w-24" value={orders[p.user_id] ?? "0"} onChange={e=>setOrders(o=>({...o,[p.user_id]:e.target.value}))} /><Button size="sm" variant="outline" disabled={busy || orders[p.user_id]===String(p.sort_order)} onClick={()=>saveOrder(p)}>Salva</Button></> : <span className="text-sm text-muted-foreground">Ordine {p.sort_order}</span>}
      </div>;})}
    </section>
    <section className="border-t border-border pt-6"><h3 className="text-2xl mb-4">Richieste di adesione <span className="text-muted-foreground">({total})</span></h3>
      {loading ? <p role="status">Caricamento…</p> : !applications.length ? <p className="text-muted-foreground text-sm">{error ? "Richieste non disponibili." : "Nessuna richiesta ricevuta."}</p> : <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Ricevuta il</TableHead><TableHead>Modulo</TableHead></TableRow></TableHeader><TableBody>{applications.map(a=><TableRow key={a.id}><TableCell>{a.full_name}</TableCell><TableCell>{a.email}</TableCell><TableCell>{new Date(a.created_at).toLocaleDateString("it-IT")}</TableCell><TableCell><Button size="sm" variant="outline" onClick={()=>downloadMembership(a.file_path,a.filename).catch(e=>toast.error(e.message))}><Download /> Scarica</Button></TableCell></TableRow>)}</TableBody></Table>}
      {total>20 && <div className="flex items-center gap-4 mt-4"><Button variant="outline" size="icon" aria-label="Pagina precedente" disabled={page===0 || loading} onClick={()=>setPage(p=>p-1)}><ChevronLeft /></Button><span className="text-sm">Pagina {page+1} di {Math.ceil(total/20)}</span><Button variant="outline" size="icon" aria-label="Pagina successiva" disabled={(page+1)*20>=total || loading} onClick={()=>setPage(p=>p+1)}><ChevronRight /></Button></div>}
    </section>
  </div>;
}