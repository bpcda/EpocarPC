import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import hero from "@/assets/hero-car.jpg";
import { PolicyDownload, splitPolicy } from "@/components/shooting/PolicyPdf";
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
    <main className="pt-20">
      <header className="relative isolate overflow-hidden bg-foreground text-background">
        <img src={hero} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/70 to-black/20" />
        <div className={`mx-auto max-w-5xl px-6 ${booking ? "py-9" : "py-16 md:py-24"}`}>
          <p className="mb-3 text-sm font-medium text-white">3 e 17 dicembre 2026 · Piacenza</p>
          <h1 className="font-headline text-5xl leading-none text-white md:text-7xl">Natale su Ruote</h1>
          <p className="mt-3 max-w-md text-white">Lo shooting fotografico gratuito per il tuo veicolo.</p>
          {!booking && <Button className="mt-6" variant="secondary" asChild><Link to={base + "/richiesta"}>Consulta le richieste e le date aperte</Link></Button>}
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 md:py-12">
        {booking && user ? <ShootingForm key={user.id} owner={user.id} /> :
          <section className="grid gap-6 md:grid-cols-2">
            <div><h2 className="font-headline text-3xl">Come partecipare</h2><p>Accedi, scegli la serata e indica il veicolo. La targa serve per gli accessi e gli eventuali permessi.</p></div>
            <div><h2 className="font-headline text-3xl">Dopo la richiesta</h2><p>EPOCAR ti comunica data e orario definitivi via email. In caso di pioggia la serata può essere annullata.</p></div>
          </section>}
      </div>
    </main>
    <Footer />
  </>;
}

function ShootingForm({ owner }: { owner: string }) {
  const [review, setReview] = useState<{ day: string; version: string; vehicle: string } | null>(null);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewTitle.current?.focus(); }, [review]);
  const [newRequest, setNewRequest] = useState(false);
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
      const [dates, vehicles, requests, album] = await Promise.all([
        external.from("shooting_evenings").select("day,policy_version,privacy_text,image_text").eq("accepting", true).order("day"),
        supabase.from("vehicles").select("id,brand,model,plate").eq("user_id", owner).order("brand"),
        external.from("shooting_requests").select("id,day,brand,model,state,appointment").eq("actor", owner).order("created_at", { ascending: false }),
        external.rpc("my_shooting_photos", { p_id: "00000000-0000-0000-0000-000000000000" }),
      ]);
      if (dates.error || vehicles.error || requests.error) throw new Error("Servizio non disponibile");
      return { dates: dates.data, vehicles: vehicles.data, requests: requests.data, photosReady: !album.error };
    },
  });
  const evening = query.data?.dates.find(item => item.day === day);
  const vehicle = query.data?.vehicles.find(item => item.id === garageId);

  const reviewing = !!evening && review?.day === evening.day && review.version === evening.policy_version;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evening || busy) return;
    const values = new FormData(event.currentTarget);
    if (!reviewing) {
      const description = vehicle ? [vehicle.brand, vehicle.model] : [values.get("brand"), values.get("model")];
      setReview({ day, version: evening.policy_version, vehicle: description.join(" ") });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const args = {
        p_key: retryKey, p_day: evening.day, p_garage: garageId || null,
        p_kind: values.get("kind"), p_brand: values.get("brand"), p_model: values.get("model"),
        p_plate: values.get("plate"), p_save: values.has("save"), p_preferred: values.get("preferred") || null,
        p_notes: values.get("notes"), p_version: evening.policy_version, p_read: values.has("read"),
        p_images: values.get("images") === "yes",
      };
      const gallery = values.has("gallery");
      const result = query.data?.photosReady || gallery
        ? await external.rpc("submit_shooting_photo_request", { ...args, p_gallery: gallery })
        : await external.rpc("submit_shooting_request", args);
      if (result.error) {
        if (result.error.message === "too_many_requests") throw new Error("Hai raggiunto il limite orario di richieste. Riprova più tardi.");
        if (result.error.code === "23505") throw new Error("Esiste già una richiesta attiva per questo veicolo e questa data.");
        if (["collection_closed", "policy_required"].includes(result.error.message)) {
          setReview(null);
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
  return <section className="mx-auto max-w-2xl space-y-5">
    {query.data.requests.length > 0 && <>
    <h2 className="font-headline text-3xl">Le tue richieste</h2>
    {query.data.photosReady && <Link className="inline-block underline" to="/account?tab=foto">Vai a Le mie foto</Link>}
    <ul className="grid gap-3">{query.data.requests.map(row =>
      <li key={row.id} className="border-l-4 border-primary bg-card p-4 shadow-sm">
        <p>{row.brand} {row.model} · Serata richiesta: {dateLabel(row.day)}</p>
        {row.state === "confirmed" && row.appointment
          ? <strong>Appuntamento confermato · {row.appointment}</strong>
          : <span>{row.state === "pending" ? "In attesa" : row.state === "confirmed" ? "Confermata" : "Annullata"}</span>}
      </li>)}</ul></>}
    {receipt ? <div className="space-y-3"><p role="status">Richiesta ricevuta e in attesa di conferma. Riferimento: {receipt}</p>
      <Button onClick={() => { setReview(null); setNewRequest(true); setReceipt(""); setDay(""); setGarageId(""); setRetryKey(crypto.randomUUID()); }}>Richiedi per un altro veicolo</Button></div>
      : !query.data.dates.length ? <p>Le richieste sono chiuse.</p> :
      query.data.requests.length > 0 && !newRequest ? <Button onClick={() => setNewRequest(true)}>Nuova richiesta</Button> :
      <form className="border bg-card p-5 shadow-sm sm:p-8" onSubmit={submit}>
        <h2 tabIndex={-1} ref={reviewTitle} className="mb-2 font-headline text-3xl">{reviewing ? "Verifica e invia" : "Richiedi uno shooting"}</h2>
        {reviewing && <p className="mb-4 border-l-4 border-primary bg-secondary p-3">{dateLabel(day)} · {review.vehicle}</p>}
        <p className="mb-6 text-sm text-muted-foreground">Scegli la serata. Riceverai l’orario definitivo via email. In caso di pioggia la serata può essere annullata.</p>
        <fieldset disabled={busy} className="space-y-4">
          <div hidden={reviewing} className="space-y-4">
          <label className="block">Serata<select className={selectClass} required value={day} onChange={e => setDay(e.target.value)}>
            <option value="">Seleziona la data</option>{query.data.dates.map(d => <option key={d.day} value={d.day}>{dateLabel(d.day)}</option>)}</select></label>
          {evening && <>
            <div className="border-t pt-5"><h3 className="mb-3 font-headline text-2xl">Il tuo veicolo</h3>
            <label className="block">Veicolo<select className={selectClass} value={garageId} onChange={e => setGarageId(e.target.value)}>
              <option value="">Inserisci un veicolo</option>{query.data.vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.plate}</option>)}</select></label>
            </div>
            {!vehicle && <>
              <label className="block">Tipo<select className={selectClass} name="kind"><option value="auto">Auto</option><option value="moto">Moto</option><option value="vespa">Vespa</option></select></label>
              <label className="block">Marca<Input required maxLength={100} name="brand" /></label>
              <label className="block">Modello<Input required maxLength={100} name="model" /></label>
              <label className="block"><input type="checkbox" name="save" /> Salva nel mio garage</label>
            </>}
            <label className="block">Targa per l’accesso<Input key={garageId} required name="plate" maxLength={20} defaultValue={vehicle?.plate ?? ""} /><small>Serve per gli accessi e gli eventuali permessi.</small></label>
            <details className="space-y-3 border-y py-3"><summary className="cursor-pointer font-medium">Preferenze e foto di gruppo (facoltativo)</summary><label className="block">Orario preferito (facoltativo)<Input type="time" name="preferred" /></label>
            <label className="block">Note o richiesta di foto di gruppo<textarea className={selectClass} name="notes" maxLength={1500} /></label></details>
            <Button type="submit">Continua ai documenti</Button>
          </>}
          </div>
          {evening && reviewing && <>
            <fieldset key={day + evening.policy_version} className="space-y-3">
              <legend className="font-semibold">Informativa e uso delle fotografie</legend>
              {splitPolicy(evening.privacy_text).text && <details className="border-l-2 border-primary/30 pl-3"><summary className="cursor-pointer font-medium">Leggi l’informativa privacy</summary><p className="whitespace-pre-wrap py-2">{splitPolicy(evening.privacy_text).text}</p></details>}<PolicyDownload value={evening.privacy_text} title="Informativa privacy" />
              <label className="block"><input type="checkbox" required name="read" /> Ho letto l’informativa</label>
              <p className="whitespace-pre-wrap">{splitPolicy(evening.image_text).text}</p><PolicyDownload value={evening.image_text} title="Autorizzazione immagini" /><p className="text-sm">La tua scelta riguarda il tuo ritratto. Per le foto di gruppo EPOCAR verifica le autorizzazioni individuali e, per i minori, quelle dei responsabili genitoriali.</p>
              <label className="block"><input type="radio" required name="images" value="yes" /> Autorizzo per me gli usi indicati</label>
              <label className="block"><input type="radio" required name="images" value="no" /> Non autorizzo</label>
              {query.data.photosReady && <><p>Riceverai gli scatti in «Le mie foto» nel tuo profilo. Avrai 30 giorni dalla consegna per scaricarli.</p>
              <label className="block"><input type="checkbox" name="gallery" /> Autorizzo EPOCAR a pubblicare le mie foto anche nella Gallery del sito, nel rispetto della mia scelta sul ritratto.</label></>}
            </fieldset>
            <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setReview(null)}>Modifica dati</Button>
            <Button type="submit">{busy ? "Invio…" : "Invia richiesta"}</Button></div>
          </>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>}
  </section>;
}
