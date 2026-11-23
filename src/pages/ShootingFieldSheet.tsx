import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useShootingAgenda } from "@/hooks/use-shooting-agenda";
import { slotLabel } from "@/components/admin/ShootingSlotGenerator";
import { Button } from "@/components/ui/button";

export default function ShootingFieldSheet() {
  const { day } = useParams();
  const { user } = useAuth();
  const query = useShootingAgenda(user?.id);
  const evening = query.data?.evenings.find(item => item.day === day);
  const confirmed = query.data?.requests.filter(row => row.state === "confirmed") ?? [];
  const sessions = (query.data?.slots ?? [])
    .filter(slot => slot.day === day)
    .sort((a, b) => a.starts.localeCompare(b.starts))
    .map(slot => ({
      slot,
      vehicles: confirmed.filter(row => row.slot_id === slot.id),
    }))
    .filter(session => session.vehicles.length > 0);

  return <main className="mx-auto max-w-3xl space-y-5 px-6 py-8 print:max-w-none print:p-0">
    <Link className="underline print:hidden" to="/admin?tab=shooting">Torna all’agenda shooting</Link>
    <h1 className="font-headline text-4xl">Natale su Ruote · Foglio per il fotografo</h1>
    {query.isPending ? <p role="status">Caricamento agenda…</p> :
      query.isError ? <p role="alert">Agenda non disponibile. <button className="underline" onClick={() => query.refetch()}>Riprova</button></p> :
      !evening ? <p>Serata non trovata.</p> : <>
        <p>{evening.day.split("-").reverse().join("/")} · {evening.meeting_place}</p>
        {evening.cancelled ? <p>Serata annullata.</p> : !sessions.length ? <p>Nessun appuntamento confermato.</p> : <>
          <Button className="print:hidden" disabled={query.isFetching} onClick={() => window.print()}>Stampa foglio</Button>
          <p>Per ogni persona riconoscibile abbina agli scatti il riferimento della liberatoria individuale e i canali autorizzati. Per i minori verifica sul posto le firme richieste di chi esercita la responsabilità genitoriale. Se manca una verifica, escludi la persona dalle inquadrature riconoscibili.</p>
          {sessions.map(({ slot, vehicles }) => <section key={slot.id} className="border-t pt-3">
            <h2 className="font-headline text-2xl">{slotLabel(slot)}</h2>
            {vehicles.map(vehicle => <div key={vehicle.id} className="space-y-2 py-3 print:break-inside-avoid">
              <h3 className="font-semibold">{vehicle.brand} {vehicle.model}</h3>
              <p className="text-sm">Richiesta {vehicle.id}</p>
              <p>{vehicle.image_permission ? "Richiedente: verificare gli usi consentiti dalla sua autorizzazione." : "Richiedente: uso promozionale del ritratto non autorizzato."}</p>
              <p>Codici scatti / gruppo ___________________________________</p>
              <p>Rif. liberatorie e versione / usi ammessi _____________________</p>
              <p>Verifica adulti e tutori / incaricato __________________________</p>
            </div>)}
          </section>)}
        </>}
      </>}
  </main>;
}
