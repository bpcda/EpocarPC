import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { benefitsTable, useBenefits, type MemberBenefit } from "@/lib/member-benefits";
import { benefitLogo, socialLinks } from "@/lib/benefit-media";
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
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-4">
      <Button disabled={busy || !!editing || !list.isSuccess} onClick={()=>{
        setMessage(""); setEditing({id:crypto.randomUUID(),revision:0,business:"",benefit:"",conditions:"",redemption:"",published:false});
      }}>Nuova convenzione</Button>
      <Link className="underline" to="/convenzioni">Vedi pagina pubblica</Link>
    </div>
    {editing && <form key={editing.id} onSubmit={save} className="border bg-card p-5">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-headline text-2xl">{editing.revision ? "Modifica convenzione" : "Nuova convenzione"}</legend>
        <label className="block">Nome dell’attività<Input required maxLength={160} name="business" defaultValue={editing.business}/></label>
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
    {list.isError ? <p role="alert">Archivio convenzioni non disponibile. <button className="underline" onClick={()=>list.refetch()}>Riprova</button></p>
      : list.isPending ? <p>Caricamento…</p> : !list.data.length ? <p>Nessuna convenzione inserita.</p>
      : <ul className="divide-y">{list.data.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><h2 className="font-semibold">{row.business}</h2><p className="text-sm">{row.published ? "Pubblicata" : "Bozza"}</p></div>
        <div className="flex gap-2"><Button variant="outline" disabled={busy || !!editing} onClick={()=>{setMessage("");setEditing(row);}}>Modifica</Button>
        <Button variant="ghost" disabled={busy || !!editing} onClick={()=>remove(row)}>Elimina</Button></div>
      </li>)}</ul>}
  </section>;
}
