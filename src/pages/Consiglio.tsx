import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConvocationWizard from "@/components/board/ConvocationWizard";
import { useAuth } from "@/hooks/use-auth";
import { groupMeetings, loadMeetings, meetingLabel, MEETING_STATUS, MODE_LABEL, respondToMeeting, romeDate, romeTime, saveMeeting, setMeetingStatus, type Meeting, type MeetingDraft } from "@/lib/board";
import { convocationDocx, downloadBlob } from "@/lib/board-docx";

function MeetingCard({ m, me, president, onEdit }: { m: Meeting; me: string; president: boolean; onEdit: (m: Meeting) => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["board-meetings"] });
  const act = useMutation({
    mutationFn: (f: () => Promise<void>) => f(),
    onSuccess: refresh, onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });
  const mine = m.board_meeting_participants.find((p) => p.user_id === me);
  const members = m.board_meeting_participants.filter((p) => p.kind === "member");
  const confirmed = members.filter((p) => p.response === "confirmed").length;
  const hasDeliberations = m.board_agenda_items.some((a) => a.kind === "deliberazione" || !!a.proposal);
  const open = ["CONVOCATO", "SOSPESO"].includes(m.status);
  return (
    <article className="border border-border bg-card p-5 space-y-3">
      <header className="flex flex-wrap justify-between gap-2">
        <h3 className="font-headline text-2xl tracking-wider">{meetingLabel(m)}</h3>
        <span className="text-xs uppercase tracking-widest border border-border px-2 py-1">{MEETING_STATUS[m.status] ?? m.status}</span>
      </header>
      <p>{romeDate(m.scheduled_at)} · ore {romeTime(m.scheduled_at)} · {MODE_LABEL[m.mode]}{m.location ? ` · ${m.location}` : ""}</p>
      {m.video_link && open && <p><a className="underline" href={m.video_link} target="_blank" rel="noreferrer">Link videoconferenza</a></p>}
      <p className="text-sm text-muted-foreground">{members.length} componenti convocati · {confirmed} conferme{hasDeliberations ? " · contiene deliberazioni" : ""}</p>
      {m.status_reason && <p className="text-sm">Motivazione: {m.status_reason}</p>}
      <details><summary className="cursor-pointer text-sm uppercase tracking-widest">Ordine del giorno</summary>
        <ol className="list-decimal pl-6 mt-2 space-y-1">{m.board_agenda_items.map((a) => <li key={a.id}>{a.title}</li>)}</ol>
      </details>
      <div className="flex flex-wrap gap-2">
        {mine && open && <>
          <Button size="sm" variant={mine.response === "confirmed" ? "default" : "outline"} onClick={() => act.mutate(() => respondToMeeting(m.id, "confirmed"))}>Partecipo</Button>
          <Button size="sm" variant={mine.response === "declined" ? "default" : "outline"} onClick={() => act.mutate(() => respondToMeeting(m.id, "declined"))}>Non posso partecipare</Button>
        </>}
        <Button size="sm" variant="outline" onClick={async () => downloadBlob(await convocationDocx(m), `Convocazione_CD_${m.meeting_number ?? "bozza"}_${m.meeting_year ?? ""}.docx`)}>Scarica convocazione (Word)</Button>
        {president && ["DRAFT", "CONVOCATO", "SOSPESO"].includes(m.status) && <Button size="sm" variant="outline" onClick={() => onEdit(m)}>Modifica</Button>}
        {president && m.status === "DRAFT" && <Button size="sm" onClick={() => act.mutate(() => setMeetingStatus(m.id, "CONVOCATO"))}>Convoca</Button>}
        {president && m.status === "SOSPESO" && <Button size="sm" onClick={() => act.mutate(() => setMeetingStatus(m.id, "CONVOCATO"))}>Riprendi convocazione</Button>}
      </div>
      {president && ["DRAFT", "CONVOCATO", "SOSPESO"].includes(m.status) && (
        <div className="flex flex-wrap gap-2 items-center">
          <Input className="max-w-xs" aria-label="Motivazione" placeholder="Motivazione per sospendere o annullare" value={reason} onChange={(e) => setReason(e.target.value)} />
          {m.status === "CONVOCATO" && <Button size="sm" variant="outline" disabled={!reason.trim()} onClick={() => act.mutate(() => setMeetingStatus(m.id, "SOSPESO", reason))}>Sospendi</Button>}
          <Button size="sm" variant="destructive" disabled={!reason.trim()} onClick={() => act.mutate(() => setMeetingStatus(m.id, "ANNULLATO", reason))}>Annulla</Button>
        </div>
      )}
    </article>
  );
}

function Section({ title, list, ...rest }: { title: string; list: Meeting[]; me: string; president: boolean; onEdit: (m: Meeting) => void }) {
  if (!list.length) return null;
  return <section className="space-y-4"><h2 className="font-headline text-3xl tracking-wider">{title}</h2><div className="grid gap-4 md:grid-cols-2">{list.map((m) => <MeetingCard key={m.id} m={m} {...rest} />)}</div></section>;
}

export default function Consiglio() {
  const { user, isBoardMember, isBoardPresident, isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [wizard, setWizard] = useState<{ open: boolean; m?: Meeting }>({ open: false });
  const meetings = useQuery({ queryKey: ["board-meetings"], queryFn: loadMeetings, enabled: !!user && (isBoardMember || isAdmin) });

  if (loading) return <p role="status" className="p-10">Caricamento…</p>;
  if (!user) return <Navigate to="/auth?next=/consiglio-direttivo" replace />;
  if (!isBoardMember && !isAdmin) return (
    <><Navbar /><main className="min-h-screen pt-32 px-6 max-w-3xl mx-auto"><h1 className="font-headline text-5xl tracking-wider mb-4">Consiglio Direttivo</h1><p>Quest'area è riservata ai componenti del Consiglio Direttivo in carica.</p></main></>
  );

  const g = groupMeetings(meetings.data ?? []);
  const props = { me: user.id, president: isBoardPresident, onEdit: (m: Meeting) => setWizard({ open: true, m }) };
  const submit = async (d: MeetingDraft, convene: boolean) => {
    const id = await saveMeeting(wizard.m?.id ?? null, d);
    if (convene) await setMeetingStatus(id, "CONVOCATO");
    toast.success(convene ? "Consiglio convocato" : "Salvato");
    await qc.invalidateQueries({ queryKey: ["board-meetings"] });
  };
  const toAnswer = (meetings.data ?? []).filter((m) => m.status === "CONVOCATO" && m.board_meeting_participants.some((p) => p.user_id === user.id && p.response === "pending"));

  return (
    <>
      <PageMeta title="Consiglio Direttivo — Epocar" description="Area riservata del Consiglio Direttivo" path="/consiglio-direttivo" />
      <Navbar />
      <main className="min-h-screen pt-28 pb-24 px-6 lg:px-8 max-w-6xl mx-auto space-y-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline text-5xl md:text-7xl tracking-wider leading-none">Consiglio Direttivo</h1>
            {!isBoardMember && <p className="text-muted-foreground mt-2">Accesso tecnico in sola lettura.</p>}
          </div>
          {isBoardPresident && <Button size="lg" onClick={() => setWizard({ open: true })}>+ Convoca Consiglio Direttivo</Button>}
        </header>
        {meetings.isLoading && <p role="status">Caricamento…</p>}
        {meetings.error && <p role="alert" className="text-destructive">Riunioni non disponibili. Se il problema persiste, il modulo potrebbe non essere ancora installato sul database.</p>}
        {meetings.data && (
          <>
            <section className="border border-border p-6 bg-card">
              <h2 className="font-headline text-2xl tracking-wider mb-2">Prossima riunione</h2>
              {g.next ? <p className="text-lg">{meetingLabel(g.next)} — {romeDate(g.next.scheduled_at)} ore {romeTime(g.next.scheduled_at)}</p> : <p className="text-muted-foreground">Nessuna riunione convocata.</p>}
              {toAnswer.length > 0 && <p className="mt-2">Hai {toAnswer.length} convocazion{toAnswer.length === 1 ? "e" : "i"} a cui rispondere.</p>}
            </section>
            <Section title="In corso" list={g.live} {...props} />
            <Section title="Programmate" list={g.upcoming} {...props} />
            {isBoardPresident && <Section title="Bozze" list={g.drafts} {...props} />}
            <Section title="Concluse e archivio" list={g.concluded} {...props} />
          </>
        )}
      </main>
      {wizard.open && <ConvocationWizard open initial={wizard.m} onOpenChange={(v) => setWizard(v ? wizard : { open: false })} onSubmit={submit} />}
    </>
  );
}
