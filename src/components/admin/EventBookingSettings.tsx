import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { BookingSettings } from '@/lib/event-booking-schema';
export default function EventBookingSettings({value,onChange}:{value:BookingSettings;onChange:(v:BookingSettings)=>void}) {
 const set=(patch:Partial<BookingSettings>)=>onChange({...value,...patch});
 return <section className="border-t border-border py-5 space-y-4"><label className="flex items-center justify-between gap-3"><span>Prenotazioni con / senza veicoli (Mossi)</span><Switch checked={value.enabled} onCheckedChange={enabled=>set({enabled})}/></label>{value.enabled&&<>
  {(['programme','price_without','price_with','privacy_text','privacy_version','account_terms','account_terms_version'] as const).map((key,i)=><label key={key} className="block space-y-1 text-sm"><span>{['Programma','Prezzo senza veicolo','Prezzo con veicolo','Informativa privacy evento','Versione privacy','Condizioni e informativa account','Versione condizioni account'][i]}</span>{['programme','privacy_text','account_terms'].includes(key)?<Textarea value={value[key]} onChange={e=>set({[key]:e.target.value})}/>:<Input value={value[key]} onChange={e=>set({[key]:e.target.value})}/>}</label>)}
  <div className="grid sm:grid-cols-2 gap-3">{(['max_people','max_vehicles','people_per_booking','vehicles_per_booking'] as const).map((key,i)=><label key={key} className="space-y-1 text-sm"><span>{['Capienza persone (vuoto = nessun limite)','Capienza veicoli (vuoto = nessun limite)','Persone per prenotazione','Veicoli per prenotazione'][i]}</span><Input type="number" min={1} max={key.startsWith('max')?100000:100} value={value[key]??''} onChange={e=>set({[key]:e.target.value?Number(e.target.value):null})}/></label>)}</div>
  <label className="flex gap-3 items-center"><Switch checked={value.drive_enabled} onCheckedChange={v=>set({drive_enabled:v})}/>Giro panoramico</label><label className="flex gap-3 items-center"><Switch checked={value.exhibition_enabled} onCheckedChange={v=>set({exhibition_enabled:v})}/>Esposizione</label>
 </>}</section>;
}
