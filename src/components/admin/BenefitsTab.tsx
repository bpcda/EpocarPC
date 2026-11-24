import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { benefitsTable, useBenefits, type MemberBenefit } from "@/lib/member-benefits";
import { benefitLogo, socialLinks } from "@/lib/benefit-media";
import { ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function BenefitsTab({ owner }: { owner: string }) {
  const list = useBenefits(owner);
  const cache = useQueryClient();
  const [editing, setEditing] = useState<MemberBenefit | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadLogo(file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const logo = await benefitLogo(file);
      setEditing(row => row && { ...row, logo });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Impossibile leggere il logo."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const data = new FormData(event.currentTarget);
    const field = (key: string) => String(data.get(key) ?? "").trim();
    let links: string[];
    try { links = socialLinks(field("social")); }
    catch (error) { setMessage((error as Error).message); return; }
    const values = { business: field("business"), benefit: field("benefit"), conditions: field("conditions"),
      redemption: field("redemption"), published: data.has("published"),
      ...(editing.logo !== undefined ? { logo: editing.logo } : {}),
      ...(editing.social_links !== undefined || links.length ? { social_links: links } : {}) };
    setBusy(true);
    setMessage("");
    try {
      const query = editing.revision ? benefitsTable().update(values).eq("id", editing.id).eq("revision", editing.revision)
        : benefitsTable().insert({ id: editing.id, ...values });
      const result = await query.select("id").single();
      if (result.error?.code === "PGRST204") {
        setMessage("Per salvare logo e social occorre aggiornare il database delle convenzioni.");
        return;
      }
      if (result.error) throw result.error;
      setEditing(null);
      setMessage(values.published ? "Convenzione pubblicata." : "Bozza salvata.");
    } catch { setMessage("Salvataggio non confermato. Controlla i campi e l’elenco aggiornato prima di riprovare."); }
    finally { await cache.invalidateQueries({queryKey:["member-benefits"]}); setBusy(false); }
  }

  async function remove(row: MemberBenefit) {
    if (busy || !window.confirm("Eliminare definitivamente la convenzione con " + row.business + "?")) return;
    setBusy(true);
    try {
      const result = await benefitsTable().delete().eq("id",row.id).eq("revision",row.revision).select("id").single();
      if (result.error) throw result.error;
      setMessage("Convenzione eliminata.");
    } catch { setMessage("Eliminazione non confermata. Controlla l’elenco aggiornato."); }
    finally { await cache.invalidateQueries({queryKey:["member-benefits"]}); setBusy(false); }
  }
  const total = list.data?.length ?? 0;
  const published = list.data?.filter(row=>row.published).length ?? 0;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" to="/convenzioni">Vedi pagina pubblica <ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link>
      <Button className="min-h-11" disabled={busy || !!editing || !list.isSuccess} onClick={()=>{
        setMessage(""); setEditing({id:crypto.randomUUID(),revision:0,business:"",benefit:"",conditions:"",redemption:"",published:false});
      }}><Plus aria-hidden="true" className="mr-2 h-4 w-4" />Nuova convenzione</Button>
    </div>
    {!editing && list.isSuccess && <dl className="grid grid-cols-3 gap-2 sm:gap-4">
      {[["Totali",total],["Bozze",total-published],["Pubblicate",published]].map(([label,count])=>
        <div key={label} className="border border-border bg-card px-3 py-4 sm:px-5">
          <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 font-headline text-3xl sm:text-4xl">{count}</dd>
        </div>)}
    </dl>}
    {editing && <form key={editing.id} onSubmit={save} className="border bg-card p-5">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-headline text-2xl">{editing.revision ? "Modifica convenzione" : "Nuova convenzione"}</legend>
        <label className="block">Nome dell’attività<Input autoFocus required maxLength={160} name="business" defaultValue={editing.business}/></label>
        <label className="block">Vantaggio per i soci<Textarea required maxLength={1200} name="benefit" defaultValue={editing.benefit}/></label>
        <label className="block">Condizioni e validità (facoltativo)<Textarea maxLength={2000} name="conditions" defaultValue={editing.conditions}/></label>
        <label className="block">Come usufruirne<Textarea required maxLength={1200} name="redemption" defaultValue={editing.redemption}/></label>
        <label className="block">Logo dell’attività (facoltativo)
          <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{
            const file = e.target.files?.[0]; e.target.value = ""; void uploadLogo(file);
          }} />
          <span className="text-sm text-muted-foreground">PNG, JPEG o WebP, fino a 5 MB.</span>
        </label>
        {editing.logo && <div className="flex items-center gap-3"><img className="h-16 w-28 object-contain" src={editing.logo} alt="Anteprima del logo" />
          <Button type="button" variant="outline" onClick={()=>setEditing({...editing,logo:null})}>Rimuovi logo</Button></div>}
        <label className="block">Link social (facoltativi, uno per riga)
          <Textarea name="social" rows={3} defaultValue={editing.social_links?.join("\n") ?? ""} placeholder="https://www.instagram.com/attivita" />
        </label>
        <label className="block"><input type="checkbox" name="published" defaultChecked={editing.published}/> Visibile nella pagina pubblica</label>
        <div className="flex gap-2"><Button type="submit">Salva convenzione</Button><Button type="button" variant="outline" onClick={()=>setEditing(null)}>Annulla</Button></div>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
    {!editing && (list.isError ? <p role="alert" className="border p-6">Archivio convenzioni non disponibile. <button className="underline" onClick={()=>list.refetch()}>Riprova</button></p>
      : list.isPending ? <p role="status" className="border p-8 text-center text-muted-foreground">Caricamento…</p>
      : !total ? <div className="border border-dashed p-8 text-center sm:p-12"><h2 className="font-headline text-2xl">Nessuna convenzione inserita</h2></div>
      : <ul aria-label="Elenco convenzioni" className="space-y-3">{list.data?.map(row=>
        <li key={row.id} className="grid gap-4 border border-border bg-card p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <span className={`inline-block px-2 py-1 text-xs font-medium ${row.published ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{row.published ? "Pubblicata" : "Bozza"}</span>
            <h2 className="mt-3 break-words font-semibold leading-snug sm:text-lg">{row.business}</h2>
            <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{row.benefit}</p>
          </div>
          <div className="flex gap-2 border-t pt-3 md:border-0 md:pt-0">
            <Button variant="outline" className="min-h-11 flex-1 md:flex-none" aria-label={`Modifica ${row.business}`} disabled={busy} onClick={()=>{setMessage("");setEditing(row);}}>
              <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />Modifica
            </Button>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive" aria-label={`Elimina ${row.business}`} disabled={busy} onClick={()=>remove(row)}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </li>)}</ul>)}
  </section>;
}
