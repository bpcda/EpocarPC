import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Expand, Minimize, Play, Pause, Square, Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { boardClient, BOARD_ROLE_LABEL, loadBoardSession, meetingLabel, recordAttendance, requestAttendance, romeTime, selectAgenda, sessionAction, type Meeting, type Participant } from "@/lib/board";
import DeliberationsPanel from "@/components/board/DeliberationsPanel";
import AudioPanel from "@/components/board/AudioPanel";

const eventLabels: Record<string, string> = {
  created: "Riunione creata", updated: "Convocazione modificata", status: "Stato aggiornato", response: "Risposta alla convocazione",
  attendance_requested: "Richiesta di identificazione", attendance_enter: "Presenza confermata", attendance_leave: "Uscita confermata",
  session_open: "Seduta aperta", session_suspend: "Seduta sospesa", session_resume: "Seduta ripresa", session_close: "Seduta chiusa", agenda_selected: "Punto in discussione",
  deliberation_created: "Delibera scritta", deliberation_version: "Testo della delibera aggiornato", deliberation_suggested: "Suggerimento di modifica",
  deliberation_suggestion_decided: "Suggerimento valutato", deliberation_withdrawn: "Delibera ritirata",
  ballot_open: "Votazione aperta", ballot_vote: "Voto registrato", ballot_close: "Votazione conclusa", ballot_cancel: "Votazione annullata",
  recording_consent: "Consenso alla registrazione", audio_track_start: "Registrazione avviata", audio_track_finish: "Registrazione caricata",
  audio_track_delete: "Traccia eliminata", audio_transcribed: "Trascrizione completata", audio_error: "Errore di trascrizione",
};

export default function LiveSession({ m, me, president, boardMember }: { m: Meeting; me: string; president: boolean; boardMember: boolean }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Participant | null>(null);
  const [mode, setMode] = useState(m.mode === "remoto" ? "remoto" : "presenza");
  const [verified, setVerified] = useState(false);
  const [note, setNote] = useState("");
  const [command, setCommand] = useState<"suspend" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [full, setFull] = useState(false);
  const [connection, setConnection] = useState("Collegamento in corso");
  const [clock, setClock] = useState(Date.now());
  const active = !m.ended_at && ["CONVOCATO", "IN_CORSO", "SOSPESO"].includes(m.status);
  const manager = president || boardMember && m.minute_taker_id === me;
  const mine = m.board_meeting_participants.find((p) => p.user_id === me);
  const session = useQuery({ queryKey: ["board-session", m.id], queryFn: () => loadBoardSession(m.id), refetchInterval: active ? 15000 : false });
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["board-meetings"] }), qc.invalidateQueries({ queryKey: ["board-session", m.id] })]); };
  const act = useMutation({ mutationFn: (f: () => Promise<void>) => f(), onSuccess: async () => { setSelected(null); setCommand(null); await refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita") });

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const refreshData = () => { void qc.invalidateQueries({ queryKey: ["board-meetings"] }); void qc.invalidateQueries({ queryKey: ["board-session", m.id] }); void qc.invalidateQueries({ queryKey: ["board-deliberations", m.id] }); void qc.invalidateQueries({ queryKey: ["board-audio", m.id] }); };
    const channel = boardClient.channel(`board-session-${m.id}`);
    for (const table of ["board_meeting_participants", "board_agenda_items", "board_meeting_events", "board_deliberations", "board_ballots", "board_audio_tracks", "board_recording_consents"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `meeting_id=eq.${m.id}` }, refreshData);
    }
    for (const table of ["board_votes", "board_deliberation_suggestions", "board_deliberation_versions", "board_deliberation_documents"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshData);
    }
    channel.on("postgres_changes", { event: "*", schema: "public", table: "board_meetings", filter: `id=eq.${m.id}` }, refreshData)
      .subscribe((status) => { if (alive) setConnection(status === "SUBSCRIBED" ? "Aggiornamenti in diretta" : "Diretta non disponibile · aggiornamento periodico"); });
    const heartbeat = async () => {
      if (!boardMember) return;
      const { error } = await boardClient.rpc("board_heartbeat", { _id: m.id });
      if (error && alive) setConnection("Collegamento da verificare");
    };
    void heartbeat();
    const timer = setInterval(() => { setClock(Date.now()); void heartbeat(); }, 20000);
    return () => { alive = false; clearInterval(timer); void boardClient.removeChannel(channel); };
  }, [m.id, active, boardMember, qc]);

  const q = session.data?.quorum;
  return <section className={full ? "fixed inset-0 z-40 overflow-auto bg-background p-4 md:p-8 space-y-5" : "space-y-5"} aria-label="Seduta dal vivo">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div><h2 className="font-headline text-3xl">{meetingLabel(m)}</h2><p className="text-xs text-muted-foreground" role="status">{active ? connection : "Seduta conclusa"}</p></div>
      <div className="flex flex-wrap gap-2">
        {president && m.status === "CONVOCATO" && !m.started_at && <Button disabled={act.isPending || !session.data} onClick={() => act.mutate(() => sessionAction(m.id, "open"))}><Play className="h-4 w-4 mr-2" />Apri seduta</Button>}
        {president && m.status === "IN_CORSO" && <Button variant="outline" disabled={act.isPending} onClick={() => { setReason(""); setCommand("suspend"); }}><Pause className="h-4 w-4 mr-2" />Sospendi</Button>}
        {president && m.status === "SOSPESO" && m.started_at && <Button disabled={act.isPending} onClick={() => act.mutate(() => sessionAction(m.id, "resume"))}><Play className="h-4 w-4 mr-2" />Riprendi seduta</Button>}
        {president && m.started_at && active && <Button variant="outline" onClick={() => { setReason(""); setCommand("close"); }}><Square className="h-4 w-4 mr-2" />Chiudi seduta</Button>}
        <Button size="icon" variant="outline" aria-label={full ? "Esci da schermo intero" : "Schermo intero"} title="Schermo intero" onClick={() => setFull(!full)}>{full ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</Button>
      </div>
    </header>
    {session.error && <p role="alert" className="text-destructive">Seduta non disponibile: occorre installare l'aggiornamento SQL della Fase 2.</p>}
    {q && !m.ended_at && <div className={`border-l-4 p-4 bg-muted ${q.met ? "border-primary" : "border-destructive"}`} role="status">
      <strong>{q.present}/{q.total} componenti presenti · quorum richiesto: {q.required}</strong>
      <p>{q.met ? "Quorum raggiunto" : "Quorum non raggiunto · non è possibile deliberare"}</p>
    </div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(230px,1fr)_minmax(300px,1.6fr)_minmax(230px,1fr)]">
      <aside className="space-y-3 min-w-0"><h3 className="font-headline text-2xl">Presenze</h3>
        {mine && boardMember && active && !mine.present && <Button className="max-w-full whitespace-normal h-auto py-2" variant="outline" disabled={act.isPending || !!mine.attendance_requested_at || !session.data} onClick={() => act.mutate(() => requestAttendance(m.id))}><UserCheck className="h-4 w-4 mr-2 shrink-0" />{mine.attendance_requested_at ? "Identificazione richiesta" : "Richiedi conferma presenza"}</Button>}
        {m.board_meeting_participants.map((p) => <article key={p.id} className="border-b border-border py-3 space-y-1 break-words">
          <strong>{p.display_name}</strong><p className="text-xs text-muted-foreground">{p.kind === "guest" ? "Invitato · senza voto" : p.board_roles.map((r) => BOARD_ROLE_LABEL[r] ?? r).join(" · ")}</p>
          <p className="text-sm">{p.present ? `Presente · ${p.attendance_mode === "remoto" ? "da remoto" : "in presenza"}` : "Presenza non confermata"}</p>
          <p className="text-xs text-muted-foreground">{p.last_seen_at && clock - new Date(p.last_seen_at).getTime() < 60000 ? "Collegamento recente" : "Collegamento non rilevato"}</p>
          {p.attendance_requested_at && <p className="text-sm">Identificazione richiesta</p>}
          {manager && active && <Button size="sm" variant="outline" disabled={act.isPending || !session.data} onClick={() => { setSelected(p); setVerified(false); setNote(""); setMode(p.attendance_mode ?? (m.mode === "remoto" ? "remoto" : "presenza")); }}>{p.present ? "Registra uscita" : "Verifica presenza"}</Button>}
        </article>)}
      </aside>
      <div className="space-y-4 min-w-0"><h3 className="font-headline text-2xl">Ordine del giorno</h3>
        {m.board_agenda_items.map((a) => <article key={a.id} className={`border-l-4 pl-4 py-3 space-y-2 break-words ${m.active_agenda_id === a.id ? "border-primary bg-muted" : "border-border"}`}>
          <p className="text-xs uppercase text-muted-foreground">{a.discussion_status === "current" ? "In discussione" : a.discussion_status === "discussed" ? "Trattato" : "Da trattare"}</p>
          <h4 className="font-headline text-2xl">{a.position}. {a.title}</h4>
          {a.description && <p className="whitespace-pre-wrap text-sm">{a.description}</p>}{a.proposal && <p className="whitespace-pre-wrap text-sm"><strong>Proposta: </strong>{a.proposal}</p>}
          {president && m.status === "IN_CORSO" && m.active_agenda_id !== a.id && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => selectAgenda(m.id, a.id))}>Apri punto</Button>}
        </article>)}
      </div>
      <aside className="min-w-0"><h3 className="font-headline text-2xl mb-3">Attività della seduta</h3><ol className="max-h-[650px] overflow-y-auto space-y-3">
        {session.data?.events.map((e) => <li key={e.id} className="border-b border-border pb-3 text-sm break-words"><time className="text-xs text-muted-foreground">{romeTime(e.created_at)}</time><p>{eventLabels[e.action] ?? "Aggiornamento della riunione"}{typeof e.detail.name === "string" ? ` · ${e.detail.name}` : ""}</p>{typeof e.detail.note === "string" && <p className="text-muted-foreground">{e.detail.note}</p>}{typeof e.detail.reason === "string" && <p className="text-muted-foreground">{e.detail.reason}</p>}</li>)}
      </ol></aside>
    </div>
    <DeliberationsPanel m={m} me={me} president={president} boardMember={boardMember} manager={manager}
      active={active} live={m.status === "IN_CORSO"} quorumMet={q?.met ?? false} />
    <AudioPanel m={m} me={me} president={president} manager={manager} active={active} live={m.status === "IN_CORSO"} />
    <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>{selected?.present ? "Conferma uscita" : "Identificazione e presenza"}</DialogTitle><DialogDescription>{selected?.display_name}</DialogDescription></DialogHeader>
      {!selected?.present && <><fieldset className="flex gap-2"><legend className="text-sm mb-2">Modalità effettiva</legend>{["presenza", "remoto"].map((v) => <Button key={v} variant={mode === v ? "default" : "outline"} disabled={m.mode !== "ibrido" && m.mode !== v} onClick={() => setMode(v)}>{v === "presenza" ? "In presenza" : "Da remoto"}</Button>)}</fieldset>
        <label className="flex items-start gap-3 text-sm"><Checkbox checked={verified} onCheckedChange={(v) => setVerified(v === true)} /><span>Identità verificata e partecipazione effettiva confermata; da remoto, comunicazione reciproca e accesso ai documenti verificati.</span></label></>}
      <label className="space-y-2 text-sm">{selected?.present ? "Motivo o verifica dell'uscita" : "Metodo di identificazione e verifica"}<Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
      <Button disabled={act.isPending || !note.trim() || !selected?.present && !verified} onClick={() => { if (selected) act.mutate(() => recordAttendance(m.id, selected.id, !selected.present, mode, verified, note)); }}><Check className="h-4 w-4 mr-2" />Conferma</Button>
    </DialogContent></Dialog>
    <Dialog open={!!command} onOpenChange={(v) => { if (!v) setCommand(null); }}><DialogContent><DialogHeader><DialogTitle>{command === "close" ? "Chiudere la seduta?" : "Sospendere la seduta?"}</DialogTitle><DialogDescription>{command === "close" ? "Le presenze saranno bloccate. Il verbale non è ancora approvato." : "Indica la motivazione della sospensione."}</DialogDescription></DialogHeader><Input aria-label="Motivazione della seduta" value={reason} onChange={(e) => setReason(e.target.value)} /><Button disabled={act.isPending || command === "suspend" && !reason.trim()} onClick={() => { if (command) act.mutate(() => sessionAction(m.id, command, reason)); }}>Conferma {command === "close" ? "chiusura" : "sospensione"}</Button></DialogContent></Dialog>
  </section>;
}
