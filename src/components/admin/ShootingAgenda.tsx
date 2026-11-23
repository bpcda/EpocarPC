import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useShootingAgenda } from "@/hooks/use-shooting-agenda";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import ShootingSlotGenerator, { slotLabel } from "./ShootingSlotGenerator";
import { policyWithFile, PolicyDownload, splitPolicy } from "@/components/shooting/PolicyPdf";
import ShootingGalleryPrep from "./ShootingGalleryPrep";
import { calendarDraft } from "@/lib/shooting-calendar";
import { Button } from "@/components/ui/button";

const db:SupabaseClient = supabase;
const states:Record<string,string> = {pending:"In attesa",confirmed:"Confermata",cancelled:"Annullata"};
const mailStates:Record<string,string> = {pending:"In coda",sending:"Invio in corso",sent:"Accettata da Brevo",failed:"Invio fallito",uncertain:"Da verificare",superseded:"Superata"};
const control = "block w-full border border-input bg-background p-2";
export default function ShootingAgenda({owner}:{owner:string}) {
  const [day,setDay] = useState("2026-12-03");
  const [panel,setPanel] = useState("Richieste");
  const [state,setState] = useState("");
  const [vehicle,setVehicle] = useState("");
  const [message,setMessage] = useState("");
  const [plate,setPlate] = useState<{id:string;value:string}|null>(null);
  const [busy,setBusy] = useState(false);
  const query = useShootingAgenda(owner);
  const data = query.data;
  const cache = useQueryClient();
  const calendarKey = ["shooting-calendar-status", owner];
  const calendar = useQuery({
    queryKey: calendarKey, enabled: !!data, retry: false,
    queryFn: async () => {
      const result = await db.rpc("shooting_calendar_status");
      if (result.error?.code === "PGRST202") return null;
      if (result.error || typeof result.data !== "number") throw new Error("Calendar non disponibile");
      return result.data;
    },
  });
  const sync = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 40; i++) {
        const result = await db.functions.invoke("shooting-calendar", { body: {} });
        if (result.error) throw new Error("Sincronizzazione non disponibile. Riprova da Agenda.");
        switch (result.data?.state) {
          case "more": continue;
          case "synced": return "Google Calendar aggiornato.";
          case "setup": return "Collega il calendario EPOCAR nelle impostazioni della funzione Supabase.";
          case "access": return "Verifica le credenziali Google e il permesso di modifica del calendario.";
          case "busy": return "Sincronizzazione già in corso. Ricontrolla fra due minuti.";
          default: return "Modifiche da sincronizzare. Riprova da Agenda.";
        }
      }
      return "Restano modifiche da sincronizzare. Premi di nuovo Sincronizza.";
    },
    onSettled: () => cache.invalidateQueries({ queryKey: calendarKey }),
  });
  const syncMessage = sync.isError ? sync.error.message : sync.data;
  async function action(name:string,args:Record<string,unknown>,notifyIds:string[] = []) {
    setBusy(true);
    setMessage("");
    try {
      const result = await db.rpc(name,args);
      if (result.error?.message === "new_version_required") throw new Error("Assegna una nuova versione ai testi e ai PDF prima di salvare.");
      if (result.error?.message === "occupied_slot_change") {
        throw new Error("Il piano cambierebbe uno slot con appuntamenti confermati. Sposta gli appuntamenti prima di modificare quello slot.");
      }
      if (result.error?.code === "PGRST202" && name === "shooting_generate_slots") {
        throw new Error("Per generare gli slot serve l’aggiornamento del database Supabase.");
      }
      if (result.error) throw new Error("Verifica disponibilità, versione e dati della serata.");
      if (calendar.data !== null && (name === "shooting_schedule" || name === "shooting_rain")) sync.mutate();
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
  const visible = rows.filter(r=>(!state||state===r.state)&&[r.kind,r.brand,r.model].join(" ").toLowerCase().includes(vehicle.toLowerCase()));
  async function settings(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evening || busy) return;
    const form = new FormData(event.currentTarget);
    const version = String(form.get("version") ?? "").trim();
    const privacyFile = form.get("privacyFile") as File;
    const imageFile = form.get("imageFile") as File;
    if ((privacyFile.size || imageFile.size) && (!version || version === evening.policy_version)) {
      setMessage("Per cambiare un PDF inserisci una nuova versione dei documenti.");
      return;
    }
    setBusy(true);
    try {
      const privacy = await policyWithFile(day, "privacy", String(form.get("privacy")), evening.privacy_text, privacyFile);
      const images = await policyWithFile(day, "images", String(form.get("images")), evening.image_text, imageFile);
      await action("shooting_configure",{p_day:day,p_open:form.has("open"),p_place:form.get("place"),p_version:version,p_privacy:privacy,p_images:images});
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Documenti non salvati."); }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4 border-l-4 border-primary bg-card p-5">
      <label className="font-semibold">Serata<select className={control} value={day} onChange={e=>{setDay(e.target.value);setPlate(null);setMessage("");}}>{data.evenings.map(e=><option key={e.day} value={e.day}>{e.day.split("-").reverse().join("/")}</option>)}</select></label>
      <p className="text-sm">{evening?.cancelled ? "Serata annullata" : evening?.accepting ? "Raccolta aperta" : "Raccolta chiusa"} · {rows.filter(r=>r.state==="pending").length} in attesa</p>
      {evening && !evening.cancelled && <Button variant="outline" asChild><a href={`/admin/shooting/${day}/foglio-fotografo`}>Foglio per il fotografo</a></Button>}
    </div>
    <div role="group" aria-label="Gestione shooting" className="grid grid-cols-2 gap-1 bg-secondary p-1 md:grid-cols-4">
      {["Richieste","Agenda","Documenti e serata","Gallery"].map(name=><Button key={name} type="button" aria-label={"Shooting · "+name} variant={panel===name?"default":"ghost"} aria-pressed={panel===name} onClick={()=>{setPanel(name);setPlate(null);setMessage("");}}>{name}</Button>)}
    </div>
    {panel==="Gallery" && <ShootingGalleryPrep key={day} day={day} rows={rows} slots={daySlots} owner={owner} />}
    {panel==="Documenti e serata" && evening && <section className="border bg-card p-5"><h3 className="font-headline text-2xl">Impostazioni della serata</h3><form key={day+evening.policy_version} className="space-y-4 py-3" onSubmit={settings}>
      <label className="block">Punto di ritrovo<input className={control} name="place" defaultValue={evening.meeting_place}/></label>
      <label className="block">Versione dei testi approvati<input className={control} name="version" defaultValue={evening.policy_version}/></label>
      <label className="block">Informativa privacy<textarea className={control} name="privacy" defaultValue={splitPolicy(evening.privacy_text).text}/></label>
      <label className="block">PDF informativa privacy<input className={control} name="privacyFile" type="file" accept=".pdf,application/pdf"/></label><PolicyDownload value={evening.privacy_text} title="Informativa privacy" />
      <label className="block">Autorizzazione immagini<textarea className={control} name="images" defaultValue={splitPolicy(evening.image_text).text}/></label>
      <label className="block">PDF autorizzazione immagini<input className={control} name="imageFile" type="file" accept=".pdf,application/pdf"/></label><PolicyDownload value={evening.image_text} title="Autorizzazione immagini" />
      <p className="text-sm text-muted-foreground">Carica i moduli vuoti approvati (PDF, massimo 10 MB). Per sostituire un documento aggiorna la versione.</p>
      <label className="block"><input name="open" type="checkbox" disabled={evening.cancelled} defaultChecked={evening.accepting}/> Apri la raccolta delle richieste</label><Button>Salva impostazioni</Button>
    </form></section>}
    {panel==="Agenda" && <section className="space-y-4 border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-headline text-2xl">Google Calendar</h3>
        <p className="text-sm" role="status">{calendar.isError ? "Collegamento alla coda Calendar non disponibile." :
          calendar.data === null ? "In attesa dell’attivazione su Supabase." : calendar.data === undefined ? "Lettura agenda…" : calendar.data === 0 ? "Nessuna modifica in coda." :
          `Modifiche da sincronizzare: ${calendar.data}.`}</p>
      </div>
      {calendar.data !== null && <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
        {sync.isPending ? "Sincronizzazione…" : "Sincronizza con Google"}
      </Button>}
    </div>
    <h3 className="font-headline text-2xl">Appuntamenti confermati</h3>
    {daySlots.filter(s=>rows.some(r=>r.slot_id===s.id && r.state==="confirmed")).map(s=><div key={s.id} className="border-t py-2">
      <strong>{slotLabel(s)}</strong> · {rows.filter(r=>r.slot_id===s.id && r.state==="confirmed").map(r=>r.brand+" "+r.model).join(", ")}
      {calendar.data === null && <a className="block text-sm underline" target="_blank" rel="noreferrer" href={calendarDraft(s,evening?.meeting_place??"")}>Prepara evento in Google Calendar ↗</a>}
    </div>)}
    {!rows.some(r=>r.state==="confirmed") && <p className="text-sm">Qui compariranno gli orari confermati da aggiungere al calendario.</p>}
    <details className="space-y-4 border-t pt-4"><summary className="cursor-pointer font-semibold">Configura slot e capienza</summary>
    {evening && !evening.cancelled && <ShootingSlotGenerator key={"slots-" + day} slots={daySlots} save={plan => {
      void action("shooting_generate_slots", {
        p_day: day, p_start: plan.start, p_end: plan.end, p_count: plan.count, p_minutes: plan.duration,
      });
    }} />}
    {daySlots.map(s=><form key={s.id+":"+s.capacity} className="flex flex-wrap items-center gap-3" onSubmit={e=>{
      e.preventDefault(); void action("shooting_capacity",{p_slot:s.id,p_capacity:Number(new FormData(e.currentTarget).get("capacity"))});
    }}><strong>{slotLabel(s)}</strong><span>{data.requests.filter(r=>r.slot_id===s.id).length} assegnati</span>
      <label>Posti <input className="w-16 border p-1" type="number" name="capacity" min="0" max="20" required defaultValue={s.capacity}/></label><Button variant="outline">Salva</Button></form>)}
    </details>
    </section>}
    {panel==="Richieste" && <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
    <label className="block">Stato<select className={control} value={state} onChange={e=>setState(e.target.value)}><option value="">Tutti</option>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label className="block">Tipo, marca o modello<input className={control} value={vehicle} onChange={e=>setVehicle(e.target.value)}/></label>
    </div>
    {!visible.length && <p className="border border-dashed p-6 text-center">Nessuna richiesta con questi filtri.</p>}
    {visible.map(r=><article className="space-y-3 border-l-4 border-primary bg-card p-5 shadow-sm" key={r.id}>
      <h4 className="font-semibold">{r.brand} {r.model} · {states[r.state]}</h4>
      <p>{r.first_name} {r.last_name} · {r.email}</p><p>Preferenza: {r.preferred?.slice(0,5) ?? "Indifferente"} · {r.day}</p>
      {r.notes && <p>{r.notes}</p>}<p>Uso immagini personale: {r.image_permission?"autorizzato nei limiti indicati":"non autorizzato"}</p>
      <details className="border-y py-2"><summary className="cursor-pointer text-sm">Dati per l’accesso</summary><Button variant="outline" onClick={async()=>{if(plate?.id===r.id){setPlate(null);return;} const result=await db.rpc("shooting_plate",{p_id:r.id});if(result.error)setMessage("Targa non disponibile.");else setPlate({id:r.id,value:result.data});}}>{plate?.id===r.id ? plate.value+" · Nascondi" : "Mostra targa per accesso"}</Button></details>
      {r.appointment && <p>{r.appointment}</p>}
      {r.state!=="cancelled" && <form key={r.revision} className="space-y-2" onSubmit={e=>{e.preventDefault();void action("shooting_schedule",{p_id:r.id,p_revision:r.revision,p_slot:new FormData(e.currentTarget).get("slot")},[r.id]);}}>
        <label>Assegna appuntamento<select className={control} name="slot" required defaultValue={r.slot_id??""}><option value="">Scegli lo slot concordato</option>{data.slots.filter(s=>s.capacity>0&&!data.evenings.find(e=>e.day===s.day)?.cancelled).map(s=><option key={s.id} value={s.id}>{s.day} · {slotLabel(s)}</option>)}</select></label>
        <Button>{r.slot_id?"Modifica appuntamento":"Conferma appuntamento"}</Button>{" "}
        <Button variant="outline" type="button" onClick={()=>{if(window.confirm("Annullare questa richiesta e avvisare il partecipante?"))void action("shooting_schedule",{p_id:r.id,p_revision:r.revision,p_slot:null},[r.id]);}}>Annulla richiesta</Button>
      </form>}
      <p>Email: {mailStates[r.delivery_state]??"Da verificare"}</p>
    </article>)}
    <Button variant="outline" onClick={async()=>{setBusy(true);try { const failed=await sendMessages(rows.filter(r=>["pending","failed"].includes(r.delivery_state)).map(r=>r.id));setMessage(failed?"Controlla configurazione e invii falliti.":"Coda elaborata."); } finally {await query.refetch();setBusy(false);} }}>Elabora email in coda per questa serata</Button></section>}
    {panel==="Documenti e serata" && <Button disabled={evening?.cancelled} variant="destructive" onClick={()=>{const ids=rows.filter(r=>r.state!=="cancelled").map(r=>r.id);if(window.confirm("Annullare la serata "+day+" e avvisare "+ids.length+" partecipanti?"))void action("shooting_rain",{p_day:day},ids);}}>Annulla serata per maltempo</Button>}
    {message && <p role="status">{message}</p>}
    {syncMessage && <p role="status">{syncMessage}</p>}
  </fieldset>;
}
