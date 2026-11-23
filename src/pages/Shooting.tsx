import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const base = "/natale-su-ruote/shooting";
const external: SupabaseClient = supabase;
const selectClass = "block w-full rounded border border-input bg-background px-3 py-2";
const dateLabel = (day: string) => new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));

export default function Shooting({ booking = false }: { booking?: boolean }) {
  const { user } = useAuth();
  return <>
    <PageMeta title="Natale su Ruote · Shooting fotografico — Epocar" description="Due serate fotografiche gratuite a Piacenza." path={booking ? base + "/richiesta" : base} noIndex={booking} />
    <Navbar />
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-32 space-y-7">
      <h1 className="font-headline text-5xl md:text-7xl">Natale su Ruote</h1>
      <p>Shooting fotografico gratuito a Piacenza il 3 e il 17 dicembre 2026. Orario e durata delle sessioni dipendono dalla programmazione della serata.</p>
      <p>La targa serve per organizzare gli accessi e gli eventuali permessi. EPOCAR confermerà data e orario via email dopo aver esaminato la richiesta. In caso di pioggia la serata potrà essere annullata.</p>
      <p>Le foto potranno promuovere Natale su Ruote e le attività EPOCAR nei limiti delle autorizzazioni raccolte. Per i gruppi occorre verificare il permesso di ciascuna persona riconoscibile e, per i minori, dei responsabili genitoriali.</p>
      {booking && user ? <ShootingForm key={user.id} owner={user.id} /> :
        <Button asChild><Link to={base + "/richiesta"}>Consulta le richieste e le date aperte</Link></Button>}
    </main>
    <Footer />
  </>;
}

function ShootingForm({ owner }: { owner: string }) {
  const [day, setDay] = useState("");
  const [garageId, setGarageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [retryKey, setRetryKey] = useState(() => crypto.randomUUID());
  const query = useQuery({
    queryKey: ["shooting-form", owner],
    gcTime: 0,
    queryFn: async () => {
      const [dates, vehicles, requests] = await Promise.all([
        external.from("shooting_evenings").select("day,policy_version,privacy_text,image_text").eq("accepting", true).order("day"),
        supabase.from("vehicles").select("id,brand,model,plate").eq("user_id", owner).order("brand"),
        external.from("shooting_requests").select("id,day,brand,model,state,appointment").eq("actor", owner).order("created_at", { ascending: false }),
      ]);
      if (dates.error || vehicles.error || requests.error) throw new Error("Servizio non disponibile");
      return { dates: dates.data, vehicles: vehicles.data, requests: requests.data };
    },
  });
  const evening = query.data?.dates.find(item => item.day === day);
  const vehicle = query.data?.vehicles.find(item => item.id === garageId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evening || busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await external.rpc("submit_shooting_request", {
        p_key: retryKey, p_day: evening.day, p_garage: garageId || null,
        p_kind: values.get("kind"), p_brand: values.get("brand"), p_model: values.get("model"),
        p_plate: values.get("plate"), p_save: values.has("save"), p_preferred: values.get("preferred") || null,
        p_notes: values.get("notes"), p_version: evening.policy_version, p_read: values.has("read"),
        p_images: values.get("images") === "yes",
      });
      if (result.error) {
        if (result.error.message === "too_many_requests") throw new Error("Hai raggiunto il limite orario di richieste. Riprova più tardi.");
        if (result.error.code === "23505") throw new Error("Esiste già una richiesta attiva per questo veicolo e questa data.");
        if (["collection_closed", "policy_required"].includes(result.error.message)) {
          setDay("");
          void query.refetch();
          throw new Error("Disponibilità o informativa aggiornate. Seleziona di nuovo la data.");
        }
        throw new Error("Invio non verificato. Controlla le tue richieste prima di riprovare.");
      }
      setReceipt(result.data);
      // The database retains the receipt job even if email is unavailable.
      void supabase.functions.invoke("shooting-receipt", { body: { id: result.data } }).catch(() => undefined);
      void query.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invio non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  if (query.isPending) return <p role="status">Caricamento delle serate…</p>;
  if (!query.data) return <div role="alert">Servizio shooting al momento indisponibile. <Button variant="outline" onClick={() => query.refetch()}>Riprova</Button></div>;
  return <section className="space-y-5">
    <h2 className="font-headline text-3xl">Le tue richieste</h2>
    {query.data.requests.length ? <ul>{query.data.requests.map(row =>
      <li key={row.id} className="py-2">
        <p>{row.brand} {row.model} · Serata richiesta: {dateLabel(row.day)}</p>
        {row.state === "confirmed" && row.appointment
          ? <strong>Appuntamento confermato · {row.appointment}</strong>
          : <span>{row.state === "pending" ? "In attesa" : row.state === "confirmed" ? "Confermata" : "Annullata"}</span>}
      </li>)}</ul> : <p>Nessuna richiesta registrata.</p>}
    {receipt ? <div className="space-y-3"><p role="status">Richiesta ricevuta e in attesa di conferma. Riferimento: {receipt}</p>
      <Button onClick={() => { setReceipt(""); setDay(""); setGarageId(""); setRetryKey(crypto.randomUUID()); }}>Richiedi per un altro veicolo</Button></div>
      : !query.data.dates.length ? <p>Le richieste sono chiuse.</p> : <form onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">Serata<select className={selectClass} required value={day} onChange={e => setDay(e.target.value)}>
            <option value="">Seleziona la data</option>{query.data.dates.map(d => <option key={d.day} value={d.day}>{dateLabel(d.day)}</option>)}</select></label>
          {evening && <>
            <label className="block">Veicolo<select className={selectClass} value={garageId} onChange={e => setGarageId(e.target.value)}>
              <option value="">Inserisci un veicolo</option>{query.data.vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.plate}</option>)}</select></label>
            {!vehicle && <>
              <label className="block">Tipo<select className={selectClass} name="kind"><option value="auto">Auto</option><option value="moto">Moto</option><option value="vespa">Vespa</option></select></label>
              <label className="block">Marca<Input required maxLength={100} name="brand" /></label>
              <label className="block">Modello<Input required maxLength={100} name="model" /></label>
              <label className="block"><input type="checkbox" name="save" /> Salva nel mio garage</label>
            </>}
            <label className="block">Targa per l’accesso<Input key={garageId} required name="plate" maxLength={20} defaultValue={vehicle?.plate ?? ""} /></label>
            <label className="block">Orario preferito (facoltativo)<Input type="time" name="preferred" /></label>
            <label className="block">Note o richiesta di foto di gruppo<textarea className={selectClass} name="notes" maxLength={1500} /></label>
            <fieldset key={day + evening.policy_version} className="space-y-3">
              <legend className="font-semibold">Informativa e uso delle fotografie</legend>
              <p className="whitespace-pre-wrap">{evening.privacy_text}</p>
              <label className="block"><input type="checkbox" required name="read" /> Ho letto l’informativa</label>
              <p className="whitespace-pre-wrap">{evening.image_text}</p>
              <label className="block"><input type="radio" required name="images" value="yes" /> Autorizzo per me gli usi indicati</label>
              <label className="block"><input type="radio" required name="images" value="no" /> Non autorizzo</label>
            </fieldset>
            <Button type="submit">{busy ? "Invio…" : "Invia richiesta"}</Button>
          </>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>}
  </section>;
}
