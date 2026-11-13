import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Expand, Minimize, Play, Pause, Square, Check, UserCheck, History, Users, ListOrdered, Gavel, FileText, Mic, FolderArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { assignChair, boardClient, BOARD_ROLE_LABEL, MEETING_STATUS, cancelBallot, loadBoardSession, meetingLabel, recordAttendance, requestAttendance, romeDate, romeTime, selectAgenda, sessionAction, type Meeting, type Participant } from "@/lib/board";
import DeliberationsPanel from "@/components/board/DeliberationsPanel";
import AudioPanel from "@/components/board/AudioPanel";
import MinutesPanel from "@/components/board/MinutesPanel";
import DossierPanel from "@/components/board/DossierPanel";
import LiveRoomPanel from "@/components/board/LiveRoomPanel";
import CorrectionsPanel from "@/components/board/CorrectionsPanel";

const eventLabels: Record<string, string> = {
  created: "Riunione creata", updated: "Convocazione modificata", status: "Stato aggiornato", response: "Risposta alla convocazione",
  attendance_requested: "Richiesta di identificazione", attendance_enter: "Presenza confermata", attendance_leave: "Uscita confermata",
  session_open: "Seduta aperta", session_suspend: "Seduta sospesa", session_resume: "Seduta ripresa", session_close: "Seduta chiusa", agenda_selected: "Punto in discussione",
  deliberation_created: "Delibera scritta", deliberation_version: "Testo della delibera aggiornato", deliberation_suggested: "Suggerimento di modifica",
  deliberation_suggestion_decided: "Suggerimento valutato", deliberation_withdrawn: "Delibera ritirata",
  ballot_open: "Votazione aperta", ballot_vote: "Voto registrato", ballot_close: "Votazione conclusa", ballot_cancel: "Votazione annullata",
  recording_consent: "Consenso alla registrazione", audio_track_start: "Registrazione avviata", audio_track_finish: "Registrazione caricata",
  audio_track_delete: "Traccia eliminata", audio_transcribed: "Trascrizione completata", audio_error: "Errore di trascrizione",
  minutes_version: "Versione del verbale", minutes_rectification: "Rettifica proposta al verbale",
  minutes_rectification_decided: "Rettifica valutata", minutes_ballot_open: "Verbale sottoposto al voto", minutes_signed: "Verbale firmato registrato",
  dossier_created: "Fascicolo preparato", dossier_verified: "Fascicolo verificato", dossier_archived: "Seduta archiviata e materiali temporanei eliminati",
  chair_assigned: "Presidenza della seduta registrata", conflict_declared: "Conflitto di interessi dichiarato",
  conflict_leave: "Uscita per conflitto di interessi", conflict_return: "Rientro dopo il punto",
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
  const [chairTarget, setChairTarget] = useState("");
  const [chairReason, setChairReason] = useState("");
  const [designation, setDesignation] = useState("");
  const [tab, setTab] = useState(m.ended_at ? "verbale" : m.started_at ? "ordine" : "presenze");
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const active = !m.ended_at && ["CONVOCATO", "IN_CORSO", "SOSPESO"].includes(m.status);
  const frozen = ["ESPORTATO", "ARCHIVIATO"].includes(m.status);
  const mine = m.board_meeting_participants.find((p) => p.user_id === me);
  const session = useQuery({ queryKey: ["board-session", m.id], queryFn: () => loadBoardSession(m.id, me), refetchInterval: active ? 15000 : false });
  const chair = boardMember && session.data?.chairUserId === me;
  const manager = !frozen && (chair || boardMember && m.minute_taker_id === me);
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["board-meetings"] }), qc.invalidateQueries({ queryKey: ["board-session", m.id] })]); };
  const act = useMutation({ mutationFn: (f: () => Promise<void>) => f(), onSuccess: async () => { setSelected(null); setCommand(null); await refresh(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita") });

  useEffect(() => {
    if (!active && !m.started_at) return;
    let alive = true;
    const refreshData = () => { void qc.invalidateQueries({ queryKey: ["board-meetings"] }); void qc.invalidateQueries({ queryKey: ["board-session", m.id] }); void qc.invalidateQueries({ queryKey: ["board-deliberations", m.id] }); void qc.invalidateQueries({ queryKey: ["board-audio", m.id] }); void qc.invalidateQueries({queryKey:["board-ai-jobs",m.id]}); void qc.invalidateQueries({ queryKey: ["board-minutes", m.id] }); void qc.invalidateQueries({ queryKey: ["board-minutes-ballot", m.id] }); void qc.invalidateQueries({ queryKey: ["board-corrections"] }); void qc.invalidateQueries({ queryKey: ["board-corrected-minutes", m.id] }); };
    const channel = boardClient.channel(`board-session-${m.id}`);
    for (const table of ["board_meeting_participants", "board_agenda_items", "board_meeting_events", "board_deliberations", "board_ballots", "board_audio_tracks", "board_recording_consents", "board_minutes", "board_ai_jobs"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `meeting_id=eq.${m.id}` }, refreshData);
    }
    for (const table of ["board_votes", "board_deliberation_suggestions", "board_deliberation_versions", "board_deliberation_documents", "board_deliberation_conflicts", "board_minute_versions", "board_minute_rectifications", "board_minutes_corrections", "board_correction_events"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshData);
    }
    channel.on("postgres_changes", { event: "*", schema: "public", table: "board_meetings", filter: `id=eq.${m.id}` }, refreshData)
      .subscribe((status) => { if (alive) setConnection(status === "SUBSCRIBED" ? "Aggiornamenti in diretta" : "Diretta non disponibile · aggiornamento periodico"); });
    const heartbeat = async () => {
      if (!boardMember || !active) return;
      const { error } = await boardClient.rpc("board_heartbeat", { _id: m.id });
      if (error && alive) setConnection("Collegamento da verificare");
    };
    void heartbeat();
    const timer = setInterval(() => { setClock(Date.now()); void heartbeat(); }, 20000);
    return () => { alive = false; clearInterval(timer); void boardClient.removeChannel(channel); };
  }, [m.id, m.started_at, active, boardMember, qc]);

  const q = session.data?.quorum;
  const requests = m.board_meeting_participants.filter((p) => !p.present && p.attendance_requested_at).length;
  const chairName = m.board_meeting_participants.find((p) => p.user_id === session.data?.chairUserId)?.display_name;
  const personalActions = active && (mine && boardMember && !mine.present || requests > 0 && manager || chair && m.started_at) || !!recordingStatus;
  const tabs = [
    { value: "presenze", label: "Presenze", icon: Users },
    { value: "ordine", label: "Ordine del giorno", icon: ListOrdered },
    { value: "delibere", label: "Delibere", icon: Gavel },
    { value: "verbale", label: "Verbale", icon: FileText },
    { value: "registrazione", label: "Registrazione", icon: Mic },
    ...(m.ended_at ? [{ value: "fascicolo", label: "Fascicolo", icon: FolderArchive }] : []),
  ];
  const panelClass = "mt-0 space-y-5 data-[state=inactive]:hidden";
  return <section className={`${full ? "fixed inset-0 z-50 overflow-auto bg-background p-4 md:p-8 space-y-5" : "space-y-5"} [&_button]:font-body [&_button]:tracking-normal`} aria-label="Seduta dal vivo">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-headline text-3xl md:text-4xl">{meetingLabel(m)}</h2>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">{MEETING_STATUS[m.status] ?? m.status}</span>
        </div>
        <p className="text-sm text-muted-foreground">{romeDate(m.scheduled_at)} · ore {romeTime(m.scheduled_at)}{chairName ? ` · Presiede ${chairName}` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chair && m.status === "CONVOCATO" && !m.started_at && <Button disabled={act.isPending || !q?.met} onClick={() => act.mutate(async () => { await sessionAction(m.id, "open"); setTab("ordine"); })}><Play className="h-4 w-4 mr-2" />Apri seduta</Button>}
        {chair && m.status === "SOSPESO" && m.started_at && <Button disabled={act.isPending} onClick={() => act.mutate(() => sessionAction(m.id, "resume"))}><Play className="h-4 w-4 mr-2" />Riprendi seduta</Button>}
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" size="sm"><History className="h-4 w-4 mr-2" />Registro attività</Button></SheetTrigger>
          <SheetContent className="overflow-y-auto sm:max-w-lg">
            <SheetHeader><SheetTitle>Registro della seduta</SheetTitle><SheetDescription>Presenze, decisioni e operazioni registrate in ordine dal più recente.</SheetDescription></SheetHeader>
            <ol className="mt-6 space-y-4">
              {session.data?.events.map((e) => <li key={e.id} className="border-b border-border pb-3 text-sm break-words"><time className="text-xs text-muted-foreground">{romeTime(e.created_at)}</time><p>{eventLabels[e.action] ?? "Aggiornamento della riunione"}{typeof e.detail.name === "string" ? ` · ${e.detail.name}` : ""}</p>{typeof e.detail.note === "string" && <p className="text-muted-foreground">{e.detail.note}</p>}{typeof e.detail.reason === "string" && <p className="text-muted-foreground">{e.detail.reason}</p>}</li>)}
            </ol>
            {!session.data?.events.length && <p className="mt-6 text-sm text-muted-foreground">Nessuna attività da mostrare.</p>}
          </SheetContent>
        </Sheet>
        <Button size="icon" variant="outline" aria-label={full ? "Esci da schermo intero" : "Schermo intero"} title={full ? "Esci da schermo intero" : "Schermo intero"} onClick={() => setFull(!full)}>{full ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</Button>
      </div>
    </header>
    {session.error && <p role="alert" className="text-destructive">Seduta non disponibile. Verifica la connessione e l'installazione del modulo Consiglio.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      {q && !m.ended_at ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1" role="status">
        <strong className="text-sm">{q.present}/{q.total} componenti presenti · quorum richiesto: {q.required}</strong>
        <p className={`text-sm ${q.met ? "text-primary" : "text-destructive"}`}>{q.met ? "Quorum raggiunto" : "Quorum non raggiunto · non è possibile deliberare"}</p>
      </div> : <p className="text-sm">{m.ended_at ? "Seduta conclusa · atti consultabili" : "Verifica delle presenze in corso…"}</p>}
      <p className="text-xs text-muted-foreground" role="status">{active ? connection : "Seduta conclusa"}</p>
    </div>
    {session.data?.hasOpenBallot && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-primary/5 p-4" role="status">
      <div><p className="font-semibold">Votazione in corso</p><p className="text-sm text-muted-foreground">{session.data.openBallotMinutesId ? "È in approvazione un verbale." : "È in votazione una delibera."} Il voto resta disponibile fino alla chiusura.</p></div>
      <Button onClick={() => setTab(session.data.openBallotMinutesId ? "verbale" : "delibere")}>Vai alla votazione</Button>
    </div>}
    {active && session.data?.chairUserId === null && session.data.openBallotId && (president || manager) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive p-4" role="alert"><p className="text-sm">La presidenza va aggiornata. Prima annulla la votazione aperta, conservando i voti registrati.</p><Button variant="outline" onClick={() => setTab("presenze")}>Verifica presidenza</Button></div>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <aside className={`min-w-0 space-y-4 xl:col-start-2 xl:row-start-1 xl:sticky ${full ? "xl:top-0" : "xl:top-24"}`} aria-label="Collegamento e stato personale">
        <LiveRoomPanel m={m} boardMember={boardMember} />
        <div className={`${personalActions ? "" : "hidden xl:block"} rounded-xl border border-border bg-card p-3 xl:p-4 space-y-3 text-sm`}>
          <p className="hidden xl:block font-medium">{chair ? "Presiedi questa seduta" : boardMember && m.minute_taker_id === me ? "Sei il verbalizzante" : boardMember ? "Partecipi come consigliere" : "Accesso tecnico in sola lettura"}</p>
          {mine && active && <p className="hidden xl:block text-muted-foreground">{mine.present ? "La tua presenza è confermata." : mine.attendance_requested_at ? "Identificazione richiesta: attendi la conferma." : "La tua presenza deve ancora essere confermata."}</p>}
          {mine && boardMember && active && !mine.present && <Button className="w-full whitespace-normal h-auto min-h-10 py-2" variant="outline" disabled={act.isPending || !!mine.attendance_requested_at || !session.data} onClick={() => act.mutate(() => requestAttendance(m.id))}><UserCheck className="h-4 w-4 mr-2 shrink-0" />{mine.attendance_requested_at ? "Identificazione richiesta" : "Richiedi conferma presenza"}</Button>}
          {!!requests && manager && active && <Button variant="outline" className="w-full" onClick={() => setTab("presenze")}>{requests} presenz{requests === 1 ? "a da verificare" : "e da verificare"}</Button>}
          {recordingStatus && <Button variant="outline" className="w-full text-destructive" onClick={() => setTab("registrazione")}><span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden />{recordingStatus}</Button>}
          {manager && active && m.started_at && !session.data?.hasOpenBallot && <Button variant="outline" className="hidden xl:flex w-full" onClick={() => setTab("verbale")}>{session.data?.minutesApproved ? "Verbale approvato · consulta" : "Prepara il verbale"}</Button>}
          {chair && m.started_at && active && <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {m.status === "IN_CORSO" && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => { setReason(""); setCommand("suspend"); }}><Pause className="h-4 w-4 mr-2" />Sospendi</Button>}
            <Button size="sm" variant="outline" disabled={act.isPending || !session.data} onClick={() => { setReason(""); setCommand("close"); }}><Square className="h-4 w-4 mr-2" />Chiudi seduta</Button>
          </div>}
        </div>
      </aside>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 xl:col-start-1 xl:row-start-1">
        <div className="mb-5 overflow-x-auto rounded-lg border border-border bg-muted p-1">
          <label className="block px-2 pt-1 text-xs text-muted-foreground sm:hidden" htmlFor={`board-view-${m.id}`}>Vista della seduta</label>
          <select id={`board-view-${m.id}`} value={tab} onChange={(e) => setTab(e.target.value)} className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm font-medium sm:hidden">
            {tabs.map(({value, label}) => <option key={value} value={value}>{label}{value === "presenze" && requests > 0 ? ` (${requests} da verificare)` : ""}{value === "registrazione" && recordingStatus ? ` · ${recordingStatus}` : ""}</option>)}
          </select>
          <TabsList aria-label="Lavori della seduta" className="hidden h-auto min-w-full w-max justify-start gap-1 bg-transparent p-0 sm:inline-flex">
            {tabs.map(({value, label, icon: Icon}) => <TabsTrigger key={value} value={value} className="min-h-11 gap-2 border border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground"><Icon className="h-4 w-4" aria-hidden />{label}{value === "presenze" && requests > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{requests}</span>}{value === "registrazione" && recordingStatus && <span className="h-2 w-2 rounded-full bg-destructive" aria-label={recordingStatus} />}</TabsTrigger>)}
          </TabsList>
        </div>
        {/* Keep editors and recorders mounted so changing views preserves drafts and capture. */}
        <TabsContent value="presenze" forceMount hidden={tab !== "presenze"} className={panelClass}>
          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4" aria-label="Presenze della seduta">
            <div><h3 className="font-headline text-2xl">Presenze</h3><p className="mt-1 text-sm text-muted-foreground">{manager ? "Verifica l’identità e conferma chi partecipa. Il collegamento audio/video è distinto dalla presenza ufficiale." : "Le presenze sono confermate da chi presiede o dal verbalizzante."}</p></div>
            <ul className="divide-y divide-border">
              {m.board_meeting_participants.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 space-y-1 break-words"><strong className="text-sm">{p.display_name}</strong><p className="text-xs text-muted-foreground">{p.kind === "guest" ? "Invitato · senza voto" : p.board_roles.map((r) => BOARD_ROLE_LABEL[r] ?? r).join(" · ")}</p><p className="text-sm">{p.present ? `Presente · ${p.attendance_mode === "remoto" ? "da remoto" : "in presenza"}` : "Presenza non confermata"}</p><p className="text-xs text-muted-foreground">{p.last_seen_at && clock - new Date(p.last_seen_at).getTime() < 60000 ? "Collegamento recente" : "Collegamento non rilevato"}{p.attendance_requested_at && !p.present ? " · Identificazione richiesta" : ""}</p></div>
                {manager && active && <Button size="sm" variant={p.present ? "outline" : "default"} disabled={act.isPending || !session.data} onClick={() => { setSelected(p); setVerified(false); setNote(""); setMode(p.attendance_mode ?? (m.mode === "remoto" ? "remoto" : "presenza")); }}>{p.present ? "Registra uscita" : "Verifica presenza"}</Button>}
              </li>)}
            </ul>
            {!m.board_meeting_participants.length && <p className="text-sm text-muted-foreground">Nessun partecipante disponibile.</p>}
          </section>
          {active && session.data?.chairUserId === null && session.data.openBallotId && (president || manager) && <div className="rounded-xl border border-destructive p-4 space-y-2">
            <p className="text-sm">La presidenza non è più valida. Annulla la votazione aperta prima di registrare una nuova presidenza.</p>
            <Input aria-label="Motivo annullamento per presidenza decaduta" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" disabled={act.isPending || !reason.trim()} onClick={() => act.mutate(() => cancelBallot(session.data.openBallotId!, reason))}>Annulla voto senza presidenza valida</Button>
          </div>}
          {active && boardMember && (president || mine?.board_roles.includes("vice_president") || m.minute_taker_id === me) && <details className="rounded-xl border border-border bg-card p-4 space-y-3">
            <summary className="cursor-pointer text-sm font-medium">Presidenza e sostituzioni</summary>
            <p className="text-sm text-muted-foreground">Registra prima l'assenza di chi è impedito. Il Vicepresidente deve attivare la sostituzione. In assenza di entrambi, il verbalizzante registra con quorum il riferimento alla designazione del Consiglio.</p>
            <label className="block text-sm">Componente che presiede<select aria-label="Componente che presiede" className="w-full border border-border bg-background p-2" value={chairTarget} onChange={(e) => setChairTarget(e.target.value)}>
              <option value="">Seleziona</option>{m.board_meeting_participants.filter((p) => p.kind === "member" && p.present && p.identified_at).map((p) => <option key={p.id} value={p.user_id ?? ""}>{p.display_name} · {p.board_roles.map((r) => BOARD_ROLE_LABEL[r] ?? r).join(", ")}</option>)}
            </select></label>
            <Input aria-label="Causale della presidenza" placeholder="Causale dell'attivazione o sostituzione" value={chairReason} maxLength={1000} onChange={(e) => setChairReason(e.target.value)} />
            <Input aria-label="Designazione del Consiglio" placeholder="Riferimento alla designazione del Consiglio (se diverso dal Vicepresidente)" value={designation} maxLength={1000} onChange={(e) => setDesignation(e.target.value)} />
            <Button size="sm" disabled={act.isPending || !chairTarget || !chairReason.trim() || session.data?.hasOpenBallot} onClick={() => act.mutate(async () => { await assignChair(m.id, chairTarget, chairReason, designation); setChairReason(""); setDesignation(""); })}>Registra presidenza</Button>
          </details>}
        </TabsContent>
        <TabsContent value="ordine" forceMount hidden={tab !== "ordine"} className={panelClass}>
          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4" aria-label="Ordine del giorno">
            <div><h3 className="font-headline text-2xl">Ordine del giorno</h3><p className="mt-1 text-sm text-muted-foreground">{chair && m.status === "IN_CORSO" ? "Apri il punto da discutere. In Delibere puoi preparare il testo e metterlo ai voti." : "Segui il punto in discussione e consulta le proposte."}</p></div>
            {m.board_agenda_items.map((a) => <article key={a.id} className={`rounded-lg border p-4 space-y-3 break-words ${m.active_agenda_id === a.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-xs font-medium text-muted-foreground">{a.discussion_status === "current" ? "In discussione" : a.discussion_status === "discussed" ? "Trattato" : "Da trattare"}</p><h4 className="text-lg font-semibold">{a.position}. {a.title}</h4></div>{chair && m.status === "IN_CORSO" && m.active_agenda_id !== a.id && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => selectAgenda(m.id, a.id))}>Apri punto</Button>}</div>
              {(a.description || a.proposal) && <details open={m.active_agenda_id === a.id}><summary className="cursor-pointer text-sm text-muted-foreground">Documenti e proposta del punto</summary><div className="mt-3 space-y-3">{a.description && <p className="whitespace-pre-wrap text-sm">{a.description}</p>}{a.proposal && <p className="whitespace-pre-wrap text-sm"><strong>Proposta: </strong>{a.proposal}</p>}</div></details>}
              {m.active_agenda_id === a.id && <Button size="sm" variant="outline" onClick={() => setTab("delibere")}>Vai alle delibere</Button>}
            </article>)}
            {!m.board_agenda_items.length && <p className="text-sm text-muted-foreground">Nessun punto all’ordine del giorno.</p>}
          </section>
        </TabsContent>
        <TabsContent value="delibere" forceMount hidden={tab !== "delibere"} className={panelClass}>
          <DeliberationsPanel m={m} me={me} president={chair} boardMember={boardMember} manager={manager} active={active} live={m.status === "IN_CORSO"} quorumMet={q?.met ?? false} />
        </TabsContent>
        <TabsContent value="verbale" forceMount hidden={tab !== "verbale"} className={panelClass}>
          {m.started_at ? <><MinutesPanel m={m} me={me} president={chair && !frozen} manager={manager} boardMember={boardMember} live={m.status === "IN_CORSO"} quorumMet={q?.met ?? false} eligible={session.data?.voterEligible ?? false} /><details open={!!session.data?.openBallotMinutesId} className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Rettifiche di sedute precedenti</summary><div className="mt-4"><CorrectionsPanel m={m} me={me} president={chair && !frozen} manager={manager} boardMember={boardMember} live={m.status === "IN_CORSO"} quorumMet={q?.met ?? false} eligible={session.data?.voterEligible ?? false} /></div></details></> : <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Il verbale sarà disponibile dopo l’apertura della seduta. Prima conferma le presenze.</p>}
        </TabsContent>
        <TabsContent value="registrazione" forceMount hidden={tab !== "registrazione"} className={panelClass}>
          <AudioPanel m={m} me={me} president={president} manager={manager} active={active} live={m.status === "IN_CORSO"} onRecordingChange={setRecordingStatus} />
        </TabsContent>
        {m.ended_at && <TabsContent value="fascicolo" forceMount hidden={tab !== "fascicolo"} className={panelClass}><DossierPanel m={m} manager={chair || boardMember && m.minute_taker_id === me} /></TabsContent>}
      </Tabs>
    </div>
    <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>{selected?.present ? "Conferma uscita" : "Identificazione e presenza"}</DialogTitle><DialogDescription>{selected?.display_name}</DialogDescription></DialogHeader>
      {!selected?.present && <><fieldset className="flex gap-2"><legend className="text-sm mb-2">Modalità effettiva</legend>{["presenza", "remoto"].map((v) => <Button key={v} variant={mode === v ? "default" : "outline"} disabled={m.mode !== "ibrido" && m.mode !== v} onClick={() => setMode(v)}>{v === "presenza" ? "In presenza" : "Da remoto"}</Button>)}</fieldset>
        <label className="flex items-start gap-3 text-sm"><Checkbox checked={verified} onCheckedChange={(v) => setVerified(v === true)} /><span>Identità verificata e partecipazione effettiva confermata; da remoto, comunicazione reciproca e accesso ai documenti verificati.</span></label></>}
      <label className="space-y-2 text-sm">{selected?.present ? "Motivo o verifica dell'uscita" : "Metodo di identificazione e verifica"}<Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
      <Button disabled={act.isPending || !note.trim() || !selected?.present && !verified} onClick={() => { if (selected) act.mutate(() => recordAttendance(m.id, selected.id, !selected.present, mode, verified, note)); }}><Check className="h-4 w-4 mr-2" />Conferma</Button>
    </DialogContent></Dialog>
    <Dialog open={!!command} onOpenChange={(v) => { if (!v) setCommand(null); }}><DialogContent><DialogHeader>
      <DialogTitle>{command === "close" ? "Chiudere la seduta?" : "Sospendere la seduta?"}</DialogTitle>
      <DialogDescription>{command === "close"
        ? session.data?.minutesApproved
          ? "Il verbale è approvato. Dopo la chiusura restano la firma e il fascicolo; le rettifiche si trattano in una nuova seduta."
          : "Il verbale non è approvato. Puoi approvarlo prima di chiudere oppure indicare il motivo della chiusura senza approvazione. La chiusura blocca presenze e votazioni."
        : "Indica la motivazione della sospensione."}</DialogDescription>
    </DialogHeader>
      {command === "close" && session.data?.hasOpenBallot && <p role="alert" className="text-destructive">Concludi o annulla la votazione aperta prima di chiudere la seduta.</p>}
      <Input aria-label="Motivazione della seduta" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button disabled={act.isPending || !session.data || !!session.error || command === "close" && session.data.hasOpenBallot
        || (command === "suspend" || !session.data.minutesApproved) && !reason.trim()}
        onClick={() => { if (command) act.mutate(() => sessionAction(m.id, command, reason)); }}>
        Conferma {command === "close" ? "chiusura" : "sospensione"}
      </Button>
    </DialogContent></Dialog>
  </section>;
}
