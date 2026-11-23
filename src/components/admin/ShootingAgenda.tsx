import { useState, type FormEvent } from "react";
import { useShootingAgenda } from "@/hooks/use-shooting-agenda";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import ShootingSlotGenerator, { slotLabel } from "./ShootingSlotGenerator";
import { Button } from "@/components/ui/button";

const db:SupabaseClient = supabase;
const states:Record<string,string> = {pending:"In attesa",confirmed:"Confermata",cancelled:"Annullata"};
const mailStates:Record<string,string> = {pending:"In coda",sending:"Invio in corso",sent:"Accettata da Brevo",failed:"Invio fallito",uncertain:"Da verificare",superseded:"Superata"};
const control = "block w-full border border-input bg-background p-2";
export default function ShootingAgenda({owner}:{owner:string}) {
  const [day,setDay] = useState("2026-12-03");
  const [state,setState] = useState("");
  const [vehicle,setVehicle] = useState("");
  const [message,setMessage] = useState("");
  const [plate,setPlate] = useState<{id:string;value:string}|null>(null);
  const [busy,setBusy] = useState(false);
  const query = useShootingAgenda(owner);
  const data = query.data;
  async function action(name:string,args:Record<string,unknown>,notifyIds:string[] = []) {
    setBusy(true);
    setMessage("");
    try {
      const result = await db.rpc(name,args);
      if (result.error?.message === "occupied_slot_change") {
        throw new Error("Il piano cambierebbe uno slot con appuntamenti confermati. Sposta gli appuntamenti prima di modificare quello slot.");
      }
      if (result.error?.code === "PGRST202" && name === "shooting_generate_slots") {
        throw new Error("Per generare gli slot serve l’aggiornamento del database Supabase.");
      }
      if (result.error) throw new Error("Verifica disponibilità, versione e dati della serata.");
      const deliveries = await sendMessages(notifyIds);
      setMessage(deliveries ? "Salvato. Controlla le email rimaste in coda." : "Modifica salvata.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operazione non riuscita."); }
    finally { await query.refetch(); setBusy(false); }
  }
  async function sendMessages(ids:string[]) {
    let failed = false;
    for (const id of ids) {
      try { const result = await db.functions.invoke("shooting-receipt",{body:{id}}); if (result.error) failed=true; }
      catch { failed=true; }
    }
    return failed;
  }
  if (!data) return <div role="status">{query.isPending ? "Caricamento agenda…" : "Agenda non disponibile."} <Button variant="outline" onClick={()=>query.refetch()}>Aggiorna</Button></div>;
  const evening=data.evenings.find(e=>e.day===day);
  const daySlots=data.slots.filter(s=>s.day===day);
  const rows=data.requests.filter(r=>(r.assigned_day ?? r.day)===day);
  function settings(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    void action("shooting_configure",{p_day:day,p_open:form.has("open"),p_place:form.get("place"),p_version:form.get("version"),p_privacy:form.get("privacy"),p_images:form.get("images")});
  }
  return <fieldset disabled={busy} className="space-y-6">
    <label className="block">Serata<select className={control} value={day} onChange={e=>{setDay(e.target.value);setPlate(null);}}>{data.evenings.map(e=><option key={e.day}>{e.day}</option>)}</select></label>
    {evening && <details key={day}><summary>Luogo, informative e apertura richieste</summary><form className="space-y-3 py-4" onSubmit={settings}>
      <label className="block">Punto di ritrovo<input className={control} name="place" defaultValue={evening.meeting_place}/></label>
      <label className="block">Versione dei testi approvati<input className={control} name="version" defaultValue={evening.policy_version}/></label>
      <label className="block">Informativa privacy<textarea className={control} name="privacy" defaultValue={evening.privacy_text}/></label>
      <label className="block">Autorizzazione immagini<textarea className={control} name="images" defaultValue={evening.image_text}/></label>
      <label className="block"><input name="open" type="checkbox" disabled={evening.cancelled} defaultChecked={evening.accepting}/> Apri la raccolta delle richieste</label><Button>Salva impostazioni</Button>
    </form></details>}
    {evening && !evening.cancelled && <Button variant="outline" asChild>
      <a href={`/admin/shooting/${day}/foglio-fotografo`}>Foglio per il fotografo</a>
    </Button>}
    <h3 className="font-headline text-2xl">Disponibilità</h3>
    {evening && !evening.cancelled && <ShootingSlotGenerator key={"slots-" + day} slots={daySlots} save={plan => {
      void action("shooting_generate_slots", {
        p_day: day, p_start: plan.start, p_end: plan.end, p_count: plan.count, p_minutes: plan.duration,
      });
    }} />}
    {daySlots.map(s=><form key={s.id+":"+s.capacity} className="flex flex-wrap items-center gap-3" onSubmit={e=>{
      e.preventDefault(); void action("shooting_capacity",{p_slot:s.id,p_capacity:Number(new FormData(e.currentTarget).get("capacity"))});
    }}><strong>{slotLabel(s)}</strong><span>{data.requests.filter(r=>r.slot_id===s.id).length} assegnati</span>
      <label>Posti <input className="w-16 border p-1" type="number" name="capacity" min="0" max="20" required defaultValue={s.capacity}/></label><Button variant="outline">Salva</Button></form>)}
    <h3 className="font-headline text-2xl">Richieste</h3>
    <label className="block">Stato<select className={control} value={state} onChange={e=>setState(e.target.value)}><option value="">Tutti</option>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label className="block">Tipo, marca o modello<input className={control} value={vehicle} onChange={e=>setVehicle(e.target.value)}/></label>
    {rows.filter(r=>(!state||state===r.state)&&[r.kind,r.brand,r.model].join(" ").toLowerCase().includes(vehicle.toLowerCase())).map(r=><article className="space-y-3 border p-4" key={r.id}>
      <h4 className="font-semibold">{r.brand} {r.model} · {states[r.state]}</h4>
      <p>{r.first_name} {r.last_name} · {r.email}</p><p>Preferenza: {r.preferred?.slice(0,5) ?? "Indifferente"} · {r.day}</p>
      {r.notes && <p>{r.notes}</p>}<p>Uso immagini personale: {r.image_permission?"autorizzato nei limiti indicati":"non autorizzato"}</p>
      <Button variant="outline" onClick={async()=>{if(plate?.id===r.id){setPlate(null);return;} const result=await db.rpc("shooting_plate",{p_id:r.id});if(result.error)setMessage("Targa non disponibile.");else setPlate({id:r.id,value:result.data});}}>{plate?.id===r.id ? plate.value+" · Nascondi" : "Mostra targa per accesso"}</Button>
      {r.appointment && <p>{r.appointment}</p>}
      {r.state!=="cancelled" && <form key={r.revision} className="space-y-2" onSubmit={e=>{e.preventDefault();void action("shooting_schedule",{p_id:r.id,p_revision:r.revision,p_slot:new FormData(e.currentTarget).get("slot")},[r.id]);}}>
        <label>Assegna appuntamento<select className={control} name="slot" required defaultValue={r.slot_id??""}><option value="">Scegli lo slot concordato</option>{data.slots.filter(s=>s.capacity>0&&!data.evenings.find(e=>e.day===s.day)?.cancelled).map(s=><option key={s.id} value={s.id}>{s.day} · {slotLabel(s)}</option>)}</select></label>
        <Button>{r.slot_id?"Modifica appuntamento":"Conferma appuntamento"}</Button>{" "}
        <Button variant="outline" type="button" onClick={()=>{if(window.confirm("Annullare questa richiesta e avvisare il partecipante?"))void action("shooting_schedule",{p_id:r.id,p_revision:r.revision,p_slot:null},[r.id]);}}>Annulla richiesta</Button>
      </form>}
      <p>Email: {mailStates[r.delivery_state]??"Da verificare"}</p>
    </article>)}
    <Button variant="outline" onClick={async()=>{setBusy(true);try { const failed=await sendMessages(rows.filter(r=>["pending","failed"].includes(r.delivery_state)).map(r=>r.id));setMessage(failed?"Controlla configurazione e invii falliti.":"Coda elaborata."); } finally {await query.refetch();setBusy(false);} }}>Elabora email in coda per questa serata</Button>{" "}
    <Button disabled={evening?.cancelled} variant="destructive" onClick={()=>{const ids=rows.filter(r=>r.state!=="cancelled").map(r=>r.id);if(window.confirm("Annullare la serata "+day+" e avvisare "+ids.length+" partecipanti?"))void action("shooting_rain",{p_day:day},ids);}}>Annulla serata per maltempo</Button>
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
