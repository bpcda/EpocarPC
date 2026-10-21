import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ADMISSION_SOURCE, admissionEvidence, APPLICATION_STATUS, type AnnualFee, cardLabel, CESSATION_REASON, eur, FEE_STATUS, loadAssociation, loadMyMembership, loadMyRegistrations, MEMBERSHIP_STATUS, type MemberStatus, publicAssociationFile } from "@/lib/association";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : null);
const panel = "border border-primary-foreground/20 p-6";
const h3 = "font-headline text-2xl tracking-wider text-primary-foreground mb-4";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-primary-foreground/15 py-3 flex justify-between gap-4">
      <dt className="text-primary-foreground/60 text-sm uppercase tracking-widest">{label}</dt>
      <dd className="text-primary-foreground text-right">{value}</dd>
    </div>
  );
}

/** Annual fee card: amounts come from the Treasury as canonical strings, shown as-is. */
function FeeSection({ fee, feeLabel, annual, iban, holder }: {
  fee: string | null; feeLabel: string; annual: AnnualFee | null; iban?: string | null; holder?: string | null;
}) {
  const showCoordinates = annual?.fee_status === "due" || annual?.fee_status === "partial" || (!annual && fee === FEE_STATUS.due);
  return (
    <section className={panel}>
      <h3 className={h3}>{feeLabel}</h3>
      <p className="text-primary-foreground text-lg">{annual?.fee_status ? FEE_STATUS[annual.fee_status] : fee ?? "Stato non ancora disponibile"}</p>
      {annual && (
        <dl className="mt-3">
          {annual.fee_amount && <Row label="Quota" value={eur(annual.fee_amount)!} />}
          {annual.fee_paid_amount && <Row label="Versato" value={eur(annual.fee_paid_amount)!} />}
          {annual.fee_balance && <Row label="Da versare" value={eur(annual.fee_balance)!} />}
          {annual.last_payment_date && <Row label="Ultimo versamento" value={`${fmt(annual.last_payment_date)}${annual.last_payment_amount ? ` · ${eur(annual.last_payment_amount)}` : ""}${annual.last_payment_receipt_number ? ` · ricevuta ${annual.last_payment_receipt_number}` : ""}`} />}
        </dl>
      )}
      {showCoordinates && iban && (
        <p className="text-primary-foreground/75 text-sm mt-3">Bonifico: IBAN <span className="font-mono">{iban}</span>{holder ? ` intestato a ${holder}` : ""}. Indica nome, cognome e anno come causale.</p>
      )}
      <p className="text-primary-foreground/60 text-sm mt-2">Lo stato della quota è aggiornato dalla Tesoreria dopo la registrazione del versamento.</p>
    </section>
  );
}

function MemberDashboard({ userId, name, category, status, card, admission, admissionProof, feeLabel, fee, annual, member, board, note, confirmed, applicationStatus }: {
  userId: string; name: string; category: string; status: string; card: number | null; admission: string | null;
  admissionProof: string | null; feeLabel: string; fee: string | null; annual: AnnualFee | null; member: MemberStatus | null;
  board: string[]; note?: string | null; confirmed: boolean; applicationStatus?: string;
}) {
  const docs = useQuery({ queryKey: ["association-docs"], queryFn: loadAssociation, retry: false });
  const regs = useQuery({ queryKey: ["my-registrations", userId], queryFn: () => loadMyRegistrations(userId) });
  const statute = docs.data?.documents.find((d) => d.kind === "statute");
  const now = Date.now();
  const upcoming = (regs.data ?? []).filter((r) => r.events && (!r.events.date || new Date(r.events.date).getTime() >= now));
  const past = (regs.data ?? []).filter((r) => r.events?.date && new Date(r.events.date).getTime() < now);

  return (
    <div className="space-y-6">
      {/* Tessera digitale */}
      <section aria-labelledby="tessera" className="bg-primary-foreground text-foreground p-6 md:p-8 max-w-xl">
        <p className="text-xs uppercase tracking-[0.3em] opacity-70">{confirmed ? "Epocar · Tessera socio" : "Epocar · Area Socio"}</p>
        <h2 id="tessera" className="font-headline text-4xl tracking-wider mt-2">{name}</h2>
        <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
          <div><p className="uppercase tracking-widest opacity-60 text-xs">Categoria</p><p className="font-medium">{category}</p></div>
          <div><p className="uppercase tracking-widest opacity-60 text-xs">Tessera</p><p className="font-medium">{cardLabel(card)}</p></div>
          <div><p className="uppercase tracking-widest opacity-60 text-xs">Stato</p><p className="font-medium">{status}</p></div>
          <div><p className="uppercase tracking-widest opacity-60 text-xs">Ammissione</p><p className="font-medium">{confirmed ? fmt(admission) ?? "Confermata" : "Ammissione da verificare"}</p></div>
        </div>
        {confirmed && admissionProof && <p className="mt-4 text-xs uppercase tracking-widest opacity-70">{admissionProof}</p>}
        {board.length > 0 && <p className="mt-6 text-xs uppercase tracking-widest">Consiglio Direttivo · {board.join(", ")}</p>}
      </section>
      {applicationStatus && <dl className="max-w-xl"><Row label="Domanda" value={applicationStatus} /></dl>}
      {member?.membership_status === "ceased" && (member.cessation_date || member.cessation_reason) && (
        <dl className="max-w-xl">
          {member.cessation_date && <Row label="Cessazione" value={fmt(member.cessation_date)!} />}
          {member.cessation_reason && <Row label="Motivo" value={CESSATION_REASON[member.cessation_reason]} />}
        </dl>
      )}
      {note && <p className="text-primary-foreground/75">{note}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <FeeSection fee={fee} feeLabel={feeLabel} annual={annual} iban={member?.payment_iban} holder={member?.payment_account_holder} />

        <section className={panel}>
          <h3 className={h3}>Documenti</h3>
          {statute ? (
            <a className="underline text-primary-foreground" href={publicAssociationFile("association-documents", statute.path)} target="_blank" rel="noreferrer">Statuto ({statute.filename})</a>
          ) : <p className="text-primary-foreground/60">Statuto non ancora pubblicato.</p>}
          <p className="mt-3"><Link to="/associazione" className="underline text-primary-foreground/80">Pagina Associazione</Link></p>
        </section>

        <section className={panel}>
          <h3 className={h3}>I miei eventi</h3>
          {regs.isLoading ? <p className="text-primary-foreground/60">Caricamento…</p> : upcoming.length === 0 ? (
            <p className="text-primary-foreground/60 mb-3">Nessuna iscrizione a eventi in programma.</p>
          ) : (
            <ul className="space-y-2 mb-3">{upcoming.map((r) => r.events ? <li key={r.id} className="text-primary-foreground">{r.events.title}{r.events.date ? ` · ${fmt(r.events.date)}` : ""}</li> : null)}</ul>
          )}
          {past.length > 0 && <p className="text-primary-foreground/60 text-sm mb-3">Eventi a cui hai partecipato: {past.length}</p>}
          <Link to="/eventi" className="underline text-primary-foreground/80">Vedi tutti gli eventi</Link>
        </section>

        <section className={panel}>
          <h3 className={h3}>Contatti</h3>
          <p className="text-primary-foreground/75 mb-4">Cambio di residenza, di veicolo o ricevuta di un bonifico: scrivi alla segreteria.</p>
          <Button variant="hero-primary" asChild><a href={`mailto:epocarpc@gmail.com?subject=${encodeURIComponent(`Socio ${name}${card ? ` (tessera n. ${card})` : ""}`)}`}>Scrivi alla segreteria</a></Button>
        </section>
      </div>
    </div>
  );
}

/** Admission display is independent of site roles and never changes existing access. */
export default function MemberArea({ userId }: { userId: string }) {
  const u = useQuery({ queryKey: ["me-user"], queryFn: async () => (await supabase.auth.getUser()).data.user, retry: false });
  const user = u.data;
  const q = useQuery({ queryKey: ["my-membership", userId], queryFn: () => loadMyMembership(userId), refetchOnWindowFocus: true });
  if (q.isLoading) return <p role="status" className="text-primary-foreground/70">Caricamento…</p>;
  if (q.error || !q.data) return <p className="text-primary-foreground/70">L’Area Socio non è al momento disponibile. Riprova più tardi.</p>;
  const { application: a, member: m, fees, roleCategory, board } = q.data;
  const evidence = admissionEvidence(a, m);
  const confirmed = evidence.status === "confirmed";
  const meta = (user?.user_metadata ?? {}) as Record<string, string>;
  const name = a?.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.full_name || user?.email || "Socio";
  const title = "font-headline text-3xl tracking-wider text-primary-foreground mb-3";
  const text = "text-primary-foreground/75 mb-6";
  const annual = (fees ?? [])[0] ?? null;
  const admissionProof = confirmed
    ? [evidence.source ? ADMISSION_SOURCE[evidence.source] : null, m?.admission_decision_date ? fmt(m.admission_decision_date) : null, m?.admission_reference ?? null].filter(Boolean).join(" · ")
    : null;

  if (m) return (
    <MemberDashboard userId={userId} name={name} category={m.category} status={!confirmed && m.membership_status === "active" ? "Ammissione da verificare" : MEMBERSHIP_STATUS[m.membership_status]}
      card={m.card_number} admission={m.admission_date ?? a?.approved_at ?? null} admissionProof={admissionProof} board={board}
      note={m.public_message ?? a?.public_status_message} member={m}
      confirmed={confirmed} applicationStatus={a ? APPLICATION_STATUS[a.status] : undefined}
      feeLabel={annual ? `Quota ${annual.membership_year}` : m.membership_year ? `Quota ${m.membership_year}` : "Quota annuale"}
      fee={m.fee_status ? FEE_STATUS[m.fee_status] : null} annual={annual} />
  );

  if (roleCategory) return (
    <MemberDashboard userId={userId} name={name} category={roleCategory} status={confirmed ? "Socio" : "Ammissione da verificare"} card={null} admission={a?.approved_at ?? null}
      admissionProof={admissionProof} confirmed={confirmed} applicationStatus={a ? APPLICATION_STATUS[a.status] : undefined} note={a?.public_status_message}
      member={null} board={board} feeLabel="Quota annuale" fee={null} annual={null} />
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
    approved: confirmed ? ["Domanda approvata", "La tua ammissione è stata approvata. I dati di socio compariranno qui appena registrati dalla Tesoreria."] : ["Ammissione da verificare", "La domanda risulta approvata, ma la data della decisione non è disponibile."],
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
