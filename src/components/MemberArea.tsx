import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cardLabel, FEE_STATUS, loadMyMembership, MEMBERSHIP_STATUS } from "@/lib/association";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : null);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-primary-foreground/15 py-3 flex justify-between gap-4">
      <dt className="text-primary-foreground/60 text-sm uppercase tracking-widest">{label}</dt>
      <dd className="text-primary-foreground text-right">{value}</dd>
    </div>
  );
}

/** Area Socio: shows the applicant's own status. Every membership fact comes from the Treasury sync. */
export default function MemberArea({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ["my-membership", userId], queryFn: () => loadMyMembership(userId), refetchOnWindowFocus: true });
  if (q.isLoading) return <p role="status" className="text-primary-foreground/70">Caricamento…</p>;
  if (q.error || !q.data) return <p className="text-primary-foreground/70">L’Area Socio non è al momento disponibile. Riprova più tardi.</p>;
  const { application: a, member: m } = q.data;
  const title = "font-headline text-3xl tracking-wider text-primary-foreground mb-3";
  const text = "text-primary-foreground/75 mb-6";

  if (m) return (
    <section aria-labelledby="socio-title">
      <h2 id="socio-title" className={title}>{MEMBERSHIP_STATUS[m.membership_status]}</h2>
      <dl className="max-w-xl">
        <Row label="Stato" value={MEMBERSHIP_STATUS[m.membership_status]} />
        <Row label="Categoria" value={m.category} />
        <Row label="Tessera" value={cardLabel(m.card_number)} />
        {m.admission_date && <Row label="Data di ammissione" value={fmt(m.admission_date)!} />}
        {m.fee_status && <Row label={m.membership_year ? `Quota ${m.membership_year}` : "Quota annuale"} value={FEE_STATUS[m.fee_status]} />}
      </dl>
      {a?.public_status_message && <p className="text-primary-foreground/75 mt-6">{a.public_status_message}</p>}
    </section>
  );

  if (!a || a.status === "draft") return (
    <section>
      <h2 className={title}>{a ? "Domanda in bozza" : "Diventa socio"}</h2>
      <p className={text}>{a ? "Hai una bozza salvata: completala e inviala quando sei pronto." : "Non hai ancora presentato la domanda di ammissione all’associazione."}</p>
      <Button variant="hero-primary" asChild><Link to="/associazione/iscrizione">{a ? "Continua la domanda" : "Presenta domanda di ammissione"}</Link></Button>
    </section>
  );

  const states = {
    submitted: ["Domanda ricevuta", `Inviata il ${fmt(a.submitted_at ?? a.created_at)}. La domanda sarà esaminata secondo la procedura prevista: l’invio non attribuisce la qualità di socio.`],
    review: ["In valutazione", "Il Consiglio Direttivo sta esaminando la tua domanda."],
    approved: ["Domanda approvata", "La tua ammissione è stata approvata. I dati di socio compariranno qui appena registrati dalla Tesoreria."],
    rejected: ["Domanda respinta", "Il Consiglio Direttivo non ha accolto la domanda."],
    cancelled: ["Domanda annullata", "La domanda è stata annullata."],
  } as const;
  const [h, p] = states[a.status];
  return (
    <section>
      <h2 className={title}>{h}</h2>
      <p className={text}>{p}</p>
      {a.public_status_message && <p className={text}>{a.public_status_message}</p>}
      {a.status === "approved" && <dl className="max-w-xl"><Row label="Tessera" value={cardLabel(null)} /></dl>}
    </section>
  );
}
