import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gavel, Pencil, Plus, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BALLOT_RESULT, DELIBERATION_STATUS, DOCUMENT_KIND, VOTE_LABEL, ballotTally, cancelBallot, castVote,
  closeBallot, currentVersion, decideSuggestion, deliberationProblem, loadDeliberations, openBallotFor,
  openBallotOf, saveDeliberation, suggestDeliberation, withdrawDeliberation,
  type Deliberation, type DeliberationDraft, type Meeting,
} from "@/lib/board";

const emptyDraft = (): DeliberationDraft => ({ agenda_item_id: "", title: "", body: "", documents: [] });
const short = (h: string) => h.slice(0, 8);

export default function DeliberationsPanel({ m, me, president, boardMember, manager, active, live, quorumMet }: {
  m: Meeting; me: string; president: boolean; boardMember: boolean; manager: boolean;
  active: boolean; live: boolean; quorumMet: boolean;
}) {
  const qc = useQueryClient();
  const [editor, setEditor] = useState<{ open: boolean; id: string | null }>({ open: false });
  const [draft, setDraft] = useState<DeliberationDraft>(emptyDraft());
  const [docName, setDocName] = useState("");
  const [ask, setAsk] = useState<{ kind: "suggest" | "withdraw" | "cancel" | "close"; target: string; label: string } | null>(null);
  const [note, setNote] = useState("");
  const list = useQuery({ queryKey: ["board-deliberations", m.id], queryFn: () => loadDeliberations(m.id), refetchInterval: active ? 15000 : false });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["board-deliberations", m.id] }),
      qc.invalidateQueries({ queryKey: ["board-session", m.id] }),
    ]);
  };
  const act = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: async () => { setAsk(null); setNote(""); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });

  const meParticipant = m.board_meeting_participants.find((p) => p.user_id === me);
  const canVote = !!meParticipant && meParticipant.kind === "member" && meParticipant.can_vote
    && meParticipant.present && !!meParticipant.identified_at && boardMember && live;
  const editable = (d: Deliberation) => manager && active && !["APPROVATA", "RITIRATA", "IN_VOTAZIONE"].includes(d.status) && !openBallotOf(d);
  const openEditor = (d?: Deliberation) => {
    const v = d ? currentVersion(d) : null;
    setDraft(d ? {
      agenda_item_id: d.agenda_item_id ?? "", title: v?.title ?? d.title, body: v?.body ?? "",
      documents: d.board_deliberation_documents.filter((x) => x.status === "bozza").map((x) => ({ name: x.name, kind: x.kind })),
    } : emptyDraft());
    setDocName("");
    setEditor({ open: true, id: d?.id ?? null });
  };
  const submit = () => {
    const problem = deliberationProblem(draft);
    if (problem) { toast.error(problem); return; }
    act.mutate(async () => { await saveDeliberation(m.id, editor.id, draft); setEditor({ open: false, id: null }); toast.success("Delibera salvata"); });
  };
  const askLabel = (d: Deliberation) => `Delibera n. ${d.number} — ${d.title}`;

  return <section className="space-y-4 border-t border-border pt-6" aria-label="Delibere e votazioni">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-headline text-3xl tracking-wider">Delibere e votazioni</h3>
      {manager && active && <Button size="sm" onClick={() => openEditor()}><Plus className="h-4 w-4 mr-2" />Nuova delibera</Button>}
    </header>
    {list.error && <p role="alert" className="text-destructive">Delibere non disponibili: occorre installare l'aggiornamento SQL della Fase 3.</p>}
    {list.data && list.data.length === 0 && <p className="text-muted-foreground">Nessuna delibera. Il Presidente o il verbalizzante possono scriverne una.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {list.data?.map((d) => {
        const v = currentVersion(d); const ballot = openBallotOf(d); const closed = d.board_ballots.filter((b) => b.status !== "aperta");
        const mine = ballot?.board_votes.find((x) => x.display_name === meParticipant?.display_name);
        return <article key={d.id} className="border border-border bg-card p-4 space-y-3 break-words">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Delibera n. {d.number}</p>
              <h4 className="font-headline text-2xl tracking-wide">{d.title}</h4>
              <p className="text-xs text-muted-foreground">Versione {d.current_version}{v ? ` · testo ${short(v.content_hash)}` : ""}{v?.locked_at ? " · testo bloccato dal voto" : ""}</p></div>
            <span className="text-xs uppercase tracking-widest border border-border px-2 py-1">{DELIBERATION_STATUS[d.status] ?? d.status}</span>
          </header>
          {v && <p className="whitespace-pre-wrap text-sm border-l-4 border-border pl-3">{v.body}</p>}
          {d.closed_reason && <p className="text-sm">Motivazione: {d.closed_reason}</p>}
          {d.board_deliberation_documents.length > 0 && <ul className="text-sm space-y-1">
            {d.board_deliberation_documents.map((x) => <li key={x.id}>· {x.name} <span className="text-xs uppercase tracking-widest text-muted-foreground">({DOCUMENT_KIND[x.kind] ?? x.kind} · {x.status})</span></li>)}
          </ul>}

          {ballot && <div className="border border-primary p-3 space-y-3">
            <p className="text-sm uppercase tracking-widest"><Gavel className="h-4 w-4 inline mr-2" />Votazione in corso · {VOTE_LABEL.favorevole} / {VOTE_LABEL.contrario} / {VOTE_LABEL.astenuto}</p>
            {canVote && <div className="flex flex-wrap gap-2">
              {(["favorevole", "contrario", "astenuto"] as const).map((x) => <Button key={x} size="sm" variant={mine?.vote === x ? "default" : "outline"} disabled={act.isPending}
                onClick={() => act.mutate(() => castVote(ballot.id, x))}>{VOTE_LABEL[x]}</Button>)}
            </div>}
            {!canVote && <p className="text-sm text-muted-foreground">Il voto è riservato ai componenti con presenza verificata.</p>}
            {(() => { const t = ballotTally(ballot); return <p className="text-sm">{t.favorevoli} favorevoli · {t.contrari} contrari · {t.astenuti} astenuti</p>; })()}
            {president && <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setNote(""); setAsk({ kind: "close", target: ballot.id, label: askLabel(d) }); }}>Chiudi votazione</Button>
              <Button size="sm" variant="outline" onClick={() => { setNote(""); setAsk({ kind: "cancel", target: ballot.id, label: askLabel(d) }); }}>Annulla votazione</Button>
            </div>}
          </div>}

          {closed.map((b) => { const t = ballotTally(b); return <div key={b.id} className="border-l-4 border-border pl-3 space-y-1">
            <p className="text-sm"><strong>{b.status === "annullata" ? "Votazione annullata" : `Esito: ${BALLOT_RESULT[b.result ?? ""] ?? b.result}`}</strong>
              {b.tie_break ? " · con voto prevalente del Presidente" : ""} · {romeShort(b.closed_at ?? b.opened_at)}</p>
            <p className="text-xs text-muted-foreground">{t.favorevoli} favorevoli · {t.contrari} contrari · {t.astenuti} astenuti</p>
            {t.nomi.length > 0 && <p className="text-xs">{t.nomi.map((x) => `${x.name}: ${VOTE_LABEL[x.vote] ?? x.vote}`).join(" · ")}</p>}
            {b.reason && <p className="text-xs text-muted-foreground">Motivazione: {b.reason}</p>}
          </div>})}

          {d.board_deliberation_suggestions.length > 0 && <details open={d.board_deliberation_suggestions.some((s) => s.status === "nuova")}>
            <summary className="cursor-pointer text-sm uppercase tracking-widest">Suggerimenti ({d.board_deliberation_suggestions.length})</summary>
            <ul className="mt-2 space-y-2">
              {d.board_deliberation_suggestions.map((s) => <li key={s.id} className="border border-border p-2 text-sm space-y-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{s.author_name} · {s.status}</p>
                <p className="whitespace-pre-wrap">{s.body}</p>
                {s.status === "nuova" && manager && <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => decideSuggestion(s.id, "accolta"))}><ThumbsUp className="h-4 w-4 mr-1" />Accogli</Button>
                  <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => decideSuggestion(s.id, "non_accolta"))}><ThumbsDown className="h-4 w-4 mr-1" />Non accogliere</Button>
                </div>}
              </li>)}
            </ul>
          </details>}

          <div className="flex flex-wrap gap-2">
            {editable(d) && <Button size="sm" variant="outline" onClick={() => openEditor(d)}><Pencil className="h-4 w-4 mr-2" />Modifica testo</Button>}
            {president && live && quorumMet && d.status === "BOZZA" && !ballot && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate(() => openBallotFor(d.id))}><Gavel className="h-4 w-4 mr-2" />Metti ai voti</Button>}
            {president && live && !quorumMet && d.status === "BOZZA" && <p className="text-xs text-muted-foreground self-center">Quorum non raggiunto: il voto non è consentito.</p>}
            {boardMember && active && !["APPROVATA", "RITIRATA"].includes(d.status) && <Button size="sm" variant="outline" onClick={() => { setNote(""); setAsk({ kind: "suggest", target: d.id, label: askLabel(d) }); }}>Suggerisci modifica</Button>}
            {editable(d) && <Button size="sm" variant="destructive" onClick={() => { setNote(""); setAsk({ kind: "withdraw", target: d.id, label: askLabel(d) }); }}>Ritira</Button>}
          </div>
        </article>;
      })}
    </div>

    <Dialog open={editor.open} onOpenChange={(open) => { if (!open) setEditor({ open: false, id: null }); }}>
      <DialogContent className="max-h-[92vh] overflow-auto">
        <DialogHeader><DialogTitle>{editor.id ? "Modifica la delibera" : "Nuova delibera"}</DialogTitle>
          <DialogDescription>Il testo resta bloccato dal momento in cui il Presidente mette la delibera ai voti; una modifica successiva crea una nuova versione.</DialogDescription></DialogHeader>
        <label className="space-y-2 text-sm">Titolo<Input value={draft.title} maxLength={300} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="space-y-2 text-sm">Punto all'ordine del giorno
          <select className="w-full border border-border bg-background px-3 py-2 text-sm" value={draft.agenda_item_id}
            onChange={(e) => setDraft({ ...draft, agenda_item_id: e.target.value })}>
            <option value="">Nessun punto collegato</option>
            {m.board_agenda_items.map((a) => <option key={a.id} value={a.id}>{a.position}. {a.title}</option>)}
          </select></label>
        <label className="space-y-2 text-sm">Testo della delibera
          <Textarea className="min-h-48" value={draft.body} maxLength={20000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
        <div className="space-y-2">
          <p className="text-sm">Documenti collegati</p>
          {draft.documents.map((x, i) => <div key={i} className="flex gap-2 items-center">
            <Input value={x.name} placeholder="Nome documento" onChange={(e) => setDraft({ ...draft, documents: draft.documents.map((y, j) => i === j ? { ...y, name: e.target.value } : y) })} />
            <select className="border border-border bg-background px-2 py-2 text-sm" value={x.kind}
              onChange={(e) => setDraft({ ...draft, documents: draft.documents.map((y, j) => i === j ? { ...y, kind: e.target.value } : y) })}>
              {Object.entries(DOCUMENT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Button size="icon" variant="outline" aria-label="Togli documento" onClick={() => setDraft({ ...draft, documents: draft.documents.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
          <div className="flex gap-2">
            <Input value={docName} placeholder="Nome del documento" onChange={(e) => setDocName(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!docName.trim()} onClick={() => { setDraft({ ...draft, documents: [...draft.documents, { name: docName.trim(), kind: "documento" }] }); setDocName(""); }}><Plus className="h-4 w-4 mr-1" />Aggiungi</Button>
          </div>
        </div>
        <Button disabled={act.isPending} onClick={submit}>Salva delibera</Button>
      </DialogContent>
    </Dialog>

    <Dialog open={!!ask} onOpenChange={(open) => { if (!open) setAsk(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{ask?.kind === "close" ? "Chiudere la votazione?" : ask?.kind === "cancel" ? "Annullare la votazione?" : ask?.kind === "withdraw" ? "Ritirare la delibera?" : "Suggerimento di modifica"}</DialogTitle>
          <DialogDescription>{ask?.label}{ask?.kind === "close" ? " — le schede espresse saranno registrate nome per nome." : ask?.kind === "cancel" ? " — la delibera torna in bozza." : ask?.kind === "withdraw" ? " — la delibera non potrà più essere riaperta." : " — il testo ufficiale non viene modificato."}</DialogDescription></DialogHeader>
        <Textarea value={note} maxLength={ask?.kind === "suggest" ? 4000 : 1000} onChange={(e) => setNote(e.target.value)}
          placeholder={ask?.kind === "suggest" ? "Cosa proponi?" : "Motivazione"} />
        <Button disabled={act.isPending || !note.trim()} onClick={() => {
          if (!ask) return;
          if (ask.kind === "suggest") act.mutate(() => suggestDeliberation(ask.target, note));
          else if (ask.kind === "withdraw") act.mutate(() => withdrawDeliberation(ask.target, note));
          else if (ask.kind === "cancel") act.mutate(() => cancelBallot(ask.target, note));
          else act.mutate(() => closeBallot(ask.target));
        }}>{ask?.kind === "suggest" ? "Invia suggerimento" : ask?.kind === "close" ? "Chiudi e verbalizza l'esito" : "Conferma"}</Button>
      </DialogContent>
    </Dialog>
  </section>;
}

const romeShort = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const _unusedX = X;
