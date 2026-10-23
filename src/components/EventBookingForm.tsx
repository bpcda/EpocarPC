import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Car, Wine, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bookingSchema, emptyVehicle, resizeVehicles, type BookingInput, type BookingSettings, type VehicleSnapshot } from '@/lib/event-booking-schema';
import { claimBooking, submitBooking, type BookingReceipt } from '@/lib/event-booking';

type Draft = Omit<BookingInput, 'privacy_accepted'> & { privacy_accepted: boolean; event_only: boolean };
const inputClass='bg-transparent border-primary-foreground/30 text-primary-foreground';
const draftKey=(id:string)=>`epocar:booking:${id}`;
function initial(id:string,s:BookingSettings):Draft {
 try { const raw=sessionStorage.getItem(draftKey(id)); if(raw) {const saved=JSON.parse(raw); if(saved.expires>Date.now()&&saved.draft.event_id===id) return {...saved.draft,privacy_accepted:false,account_terms_accepted:false}; sessionStorage.removeItem(draftKey(id));} } catch { /* storage unavailable */ }
 return {event_id:id,idempotency_key:crypto.randomUUID(),mode:'without_vehicle',first_name:'',last_name:'',email:'',phone:'',participants:1,drive:false,exhibition:false,vehicles:[],privacy_accepted:false,privacy_version:s.privacy_version,account_requested:false,account_terms_accepted:false,account_terms_version:s.account_terms_version,event_only:false};
}
export default function EventBookingForm({eventId,settings}:{eventId:string;settings:BookingSettings}) {
 const {user}=useAuth(); const [params]=useSearchParams();
 const [draft,setDraft]=useState(()=>initial(eventId,settings)); const [garage,setGarage]=useState<VehicleSnapshot[]>([]);
 const [review,setReview]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 const [receipt,setReceipt]=useState<BookingReceipt|null>(null); const [activation,setActivation]=useState('');
 const update=(value:Partial<Draft>)=>{setDraft(d=>({...d,...value}));setError('');};
 useEffect(()=>{if(!receipt) try {sessionStorage.setItem(draftKey(eventId),JSON.stringify({expires:Date.now()+30*60*1000,draft}));}catch{/* storage unavailable */}},[draft,eventId,receipt]);
 useEffect(()=>{
  if(!user) {setGarage([]);return;} let active=true;
  Promise.all([supabase.from('profiles').select('first_name,last_name,phone').eq('user_id',user.id).maybeSingle(),supabase.from('vehicles').select('id,type,brand,model,year,plate').eq('user_id',user.id)]).then(([p,v])=>{
   if(!active)return;
   setDraft(d=>({...d,first_name:d.first_name||p.data?.first_name||'',last_name:d.last_name||p.data?.last_name||'',phone:d.phone||p.data?.phone||'',email:d.email||user.email||''}));
   setGarage((v.data??[]).map(x=>({garage_id:x.id,type:x.type,brand:x.brand,model:x.model,year:x.year??0,plate:x.plate??''})));
  }); return ()=>{active=false;};
 },[user]);
 useEffect(()=>{
  const id=params.get('claim'); if(!id||!user)return;
  if(!/^[0-9a-f-]{36}$/i.test(id))return;
  claimBooking(id).then(r=>setActivation(`Account verificato. ${r.saved} veicoli aggiunti al garage.`)).catch(()=>setActivation('Per collegare la prenotazione, apri il link di attivazione ricevuto via email.'));
 },[params,user]);
 const choose=(mode:Draft['mode'])=>{
  if(mode==='without_vehicle'&&draft.vehicles.some(v=>v.brand||v.model||v.plate)&&!window.confirm('Passare senza veicoli ed eliminare i dettagli inseriti?'))return;
  update({mode,vehicles:mode==='with_vehicle'?(draft.vehicles.length?draft.vehicles:[emptyVehicle()]):[],drive:false,exhibition:false});
 };
 const validated=()=>bookingSchema.safeParse({...draft,privacy_version:settings.privacy_version,account_terms_version:settings.account_terms_version,account_requested:draft.mode==='with_vehicle'&&!draft.event_only});
 const toReview=()=>{const result=validated();if(!result.success){setError(result.error.issues[0]?.message||'Controlla i dati');return;}setReview(true);};
 const send=async()=>{
  const result=validated();if(!result.success){setError(result.error.issues[0]?.message||'Controlla i dati');return;}
  setBusy(true);setError('');
  try{const r=await submitBooking(result.data);setReceipt(r);sessionStorage.removeItem(draftKey(eventId));if(user&&r.account_requested){try{await claimBooking(r.id);setActivation('Veicoli salvati nel tuo garage.');}catch{setActivation('Prenotazione valida; salvataggio garage da riprovare.');}}}
  catch(e){setError(e instanceof Error?e.message:'Invio non riuscito');}finally{setBusy(false);}
 };
 const check=(label:string,checked:boolean,change:(v:boolean)=>void)=> <label className="flex gap-3 items-start text-sm"><Checkbox checked={checked} onCheckedChange={v=>change(v===true)} className="border-primary-foreground/60 mt-0.5"/><span>{label}</span></label>;
 const numberSelect=(label:string,value:number,max:number,change:(n:number)=>void)=><label className="block space-y-2"><span className="text-sm">{label} *</span><Select value={String(value)} onValueChange={v=>change(Number(v))}><SelectTrigger className={inputClass}><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:max},(_,i)=><SelectItem key={i+1} value={String(i+1)}>{i+1}</SelectItem>)}</SelectContent></Select></label>;
 if(receipt)return <section className="border-t border-primary-foreground/30 py-10 space-y-5 text-primary-foreground" aria-live="polite"><Check className="h-10 w-10"/><h2 className="font-headline text-4xl">Prenotazione confermata</h2><p className="font-mono break-all">{receipt.reference}</p><p>{draft.participants} persone · {draft.vehicles.length} veicoli</p><p className="text-sm">{receipt.email_status==='sent'?'Riepilogo inviato via email.':'Prenotazione registrata. L’email riepilogativa non è stata inviata: conserva il riferimento.'}</p>{receipt.account_requested&&!user&&<p className="text-sm">{receipt.activation_status==='sent'?'Apri il link ricevuto via email per attivare o accedere al tuo account e salvare i veicoli.':'La richiesta account è registrata, ma l’email di attivazione non è stata inviata. La prenotazione resta valida.'}</p>}{activation&&<p>{activation}</p>}<Button asChild variant="outline" className={inputClass}><Link to="/eventi">Torna agli eventi</Link></Button></section>;
 return <section className="text-primary-foreground space-y-8">
  {activation&&<p role="status">{activation}</p>}
  {!review&&<>
   <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Modalità di partecipazione">
    {[{mode:'without_vehicle' as const,icon:Wine,title:'Parteciperò senza auto o moto d’epoca',text:'Degustazione vini + aperitivo',price:settings.price_without},{mode:'with_vehicle' as const,icon:Car,title:'Parteciperò con auto o moto d’epoca',text:'Giro panoramico, esposizione, degustazione + aperitivo',price:settings.price_with}].map(x=><Button key={x.mode} type="button" variant="outline" aria-pressed={draft.mode===x.mode} onClick={()=>choose(x.mode)} className={`h-auto min-h-44 whitespace-normal text-left items-start justify-start flex-col gap-3 p-5 ${draft.mode===x.mode?'bg-primary-foreground text-foreground hover:bg-primary-foreground/90':'bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10'}`}><x.icon className="h-6 w-6 shrink-0"/><span className="font-headline text-2xl leading-tight">{x.title}</span><span className="text-xs font-normal leading-relaxed">{x.text}</span>{x.price&&<span>{x.price}</span>}</Button>)}
   </div>
   {!user&&<p className="text-sm">Hai già un account Epocar? <Link className="underline" to={`/auth?next=${encodeURIComponent(`/eventi/${eventId}/iscrizione`)}`}>Accedi</Link></p>}
   <div className="border-t border-primary-foreground/30 pt-8"><h2 className="font-headline text-3xl mb-5">I tuoi dati</h2><div className="grid sm:grid-cols-2 gap-4">{(['first_name','last_name','email','phone'] as const).map((key,i)=><label key={key} className="space-y-2"><span className="text-sm">{['Nome','Cognome','Email','Telefono'][i]} *</span><Input autoComplete={['given-name','family-name','email','tel'][i]} type={key==='email'?'email':key==='phone'?'tel':'text'} value={draft[key]} className={inputClass} onChange={e=>update({[key]:e.target.value})}/></label>)}</div></div>
   <div className="grid sm:grid-cols-2 gap-4">{numberSelect('Numero di partecipanti',draft.participants,settings.people_per_booking,n=>update({participants:n}))}{draft.mode==='with_vehicle'&&numberSelect('Numero di veicoli',draft.vehicles.length,settings.vehicles_per_booking,n=>update({vehicles:resizeVehicles(draft.vehicles,n,()=>window.confirm('Eliminare i dati dei veicoli eccedenti?'))}))}</div>
   {draft.mode==='with_vehicle'&&<>
    <div className="space-y-3"><h2 className="font-headline text-2xl">A cosa parteciperai?</h2>{settings.drive_enabled&&check('Giro panoramico',draft.drive,v=>update({drive:v}))}{settings.exhibition_enabled&&check('Esposizione vetture e moto d’epoca',draft.exhibition,v=>update({exhibition:v}))}</div>
    <div className="space-y-4">{draft.vehicles.map((v,i)=>{
     const edit=(patch:Partial<VehicleSnapshot>)=>update({vehicles:draft.vehicles.map((x,j)=>i===j?{...x,...patch,garage_id:null}:x)});
     return <div key={i} className="border border-primary-foreground/30 p-5 space-y-4"><h3 className="font-headline text-2xl">Veicolo {i+1} di {draft.vehicles.length}</h3>{user&&garage.length>0&&<Select value={v.garage_id??'new'} onValueChange={id=>{const selected=garage.find(g=>g.garage_id===id);update({vehicles:draft.vehicles.map((x,j)=>j===i?(selected?{...selected}:emptyVehicle()):x)});}}><SelectTrigger className={inputClass} aria-label={`Garage veicolo ${i+1}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">Inserisci un nuovo veicolo</SelectItem>{garage.map(g=><SelectItem key={g.garage_id} value={g.garage_id??'new'}>{g.brand} {g.model} · {g.plate||'Targa da completare'}</SelectItem>)}</SelectContent></Select>}
      <label className="block space-y-2"><span className="text-sm">Tipologia *</span><Select value={v.type} onValueChange={type=>edit({type:type as VehicleSnapshot['type']})}><SelectTrigger className={inputClass}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">Auto d’epoca</SelectItem><SelectItem value="moto">Moto d’epoca</SelectItem><SelectItem value="vespa">Vespa d’epoca</SelectItem></SelectContent></Select></label>
      <div className="grid sm:grid-cols-2 gap-4">{(['brand','model','year','plate'] as const).map((key,j)=><label className="space-y-2" key={key}><span className="text-sm">{['Marca','Modello','Anno','Targa'][j]} *</span><Input aria-label={`${['Marca','Modello','Anno','Targa'][j]} veicolo ${i+1}`} className={inputClass} type={key==='year'?'number':'text'} value={v[key]||''} onChange={e=>edit({[key]:key==='year'?Number(e.target.value):e.target.value})}/></label>)}</div>
     </div>;
    })}</div>
    {check('Non registrare me e i miei veicoli al sito Epocar',draft.event_only,v=>update({event_only:v,account_terms_accepted:false}))}
    {!draft.event_only&&<div className="space-y-3 text-sm"><p>{user?'I nuovi veicoli saranno salvati nel tuo garage.':'Richiedo un account Epocar e il salvataggio dei veicoli dopo la verifica via email. Nessun consenso promozionale.'}</p><p className="whitespace-pre-wrap max-h-48 overflow-y-auto">{settings.account_terms||'Le condizioni per la creazione account non sono ancora disponibili. Puoi prenotare senza registrarti.'}</p>{check('Accetto le condizioni e l’informativa account',draft.account_terms_accepted,v=>update({account_terms_accepted:v}))}</div>}
   </>}
   <div className="space-y-3 border-t border-primary-foreground/30 pt-6"><p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">{settings.privacy_text}</p>{check('Ho letto e accetto l’informativa privacy dell’evento',draft.privacy_accepted,v=>update({privacy_accepted:v}))}</div>
  </>}
  {review&&<div className="space-y-5 border-t border-primary-foreground/30 pt-6"><h2 className="font-headline text-3xl">Riepilogo prenotazione</h2><p>{draft.first_name} {draft.last_name}<br/>{draft.email}<br/>{draft.phone}</p><p>{draft.participants} persone · {draft.vehicles.length} veicoli</p><p>{draft.drive?'Giro panoramico':''}{draft.drive&&draft.exhibition?' + ':''}{draft.exhibition?'Esposizione':''}</p>{draft.vehicles.map((v,i)=><p key={i}>{i+1}. {v.brand} {v.model} · {v.year} · {v.plate}</p>)}<p className="text-sm">{draft.mode==='with_vehicle'&&!draft.event_only?'Richiesta account / salvataggio garage incluso.':'Solo prenotazione evento.'}</p></div>}
  {error&&<p role="alert" className="text-sm border border-primary-foreground/40 p-4">{error}</p>}
  <div className="flex flex-wrap gap-3">{review&&<Button variant="outline" className={inputClass} disabled={busy} onClick={()=>setReview(false)}><ArrowLeft className="h-4 w-4 mr-2"/>Modifica</Button>}<Button className="bg-primary-foreground text-foreground hover:bg-primary-foreground/90" disabled={busy} onClick={review?send:toReview}>{busy?'Invio in corso…':review?'Conferma prenotazione':'Verifica riepilogo'}<ArrowRight className="h-4 w-4 ml-2"/></Button></div>
 </section>;
}
