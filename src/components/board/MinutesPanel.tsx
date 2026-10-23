import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Sparkles, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BALLOT_RESULT, ballotTally, cancelBallot, castVote, closeBallot, currentMinutesVersion, decideRectification,
  draftMinutesWithAi, loadMinutes, MINUTES_SOURCE, MINUTES_STATUS, rectifyMinutes, registerSignedMinutes,
  saveMinutes, submitMinutesVote, VOTE_LABEL, type Meeting, type Minutes,
} from "@/lib/board";
import { minutesDocx, downloadBlob } from "@/lib/board-docx";
import { useQuery as useBallotQuery } from "@tanstack/react-query";
import { boardClient } from "@/lib/board";
import { z } from "zod";

const openMinutesBallot = z.object({
  id: z.string(), status: z.string(), result: z.string().nullable(), tally: z.record(z.unknown()).default({}),
  tie_break: z.boolean().default(false), opened_at: z.string(), closed_at: z.string().nullable().optional(),
  board_votes: z.array(z.object({ id: z.string(), display_name: z.string(), vote: z.enum(["favorevole", "contrario", "astenuto"]), recorded_at: z.string() })).default([]),
});

function useMinutesBallot(meetingId: string, minutesId: string | undefined) {
  return useBallotQuery({
    queryKey: ["board-minutes-ballot", meetingId],
    enabled: !!minutesId,
    queryFn: async () => {
      const { data, error } = await boardClient.from("board_ballots")
        .select("*, board_votes(*)").eq("minutes_id", minutesId!).order("opened_at", { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      const row = data?.[0];
      return row ? openMinutesBallot.parse(row) : null;
    },
  });
}

export default function MinutesPanel({ m, me, president, manager, boardMember, live, quorumMet }: {
  m: Meeting; me: string; president: boolean; manager: boolean; boardMember: boolean; live: boolean; quorumMet: boolean;
}) {
  const qc = useQueryClient();
  const minutes = useQuery({ queryKey: ["board-minutes", m.id], queryFn: () => loadMinutes(m.id) });
  const ballot = useMinutesBallot(m.id, minutes.data?.id);
  const [draft, setDraft] = useState<string | null>(null);
  const [rectification, setRectification] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["board-minutes", m.id] }),
      qc.invalidateQueries({ queryKey: ["board-minutes-ballot", m.id] }),
      qc.invalidateQueries({ queryKey: ["board-session", m.id] }),
    ]);
  };
  const act = useMutation({
    mutationFn: (f: () => Promise<void>) => f(),
    onSuccess: async () => { setDraft(null); setRectification(""); setCancelReason(""); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });

  const mn: Minutes | null | undefined = minutes.data;
  const version = mn ? currentMinutesVersion(mn) : null;
  const openBallot = ballot.data?.status === "aperta" ? ballot.data : null;
  const editable = manager && mn && ["BOZZA", "IN_REVISIONE"].includes(mn.status);
  const myVote = openBallot?.board_votes.find((v) => v.display_name === m.board_meeting_participants.find((p) => p.user_id === me)?.display_name);

  if (minutes.error) {
    return <section className="border border-border p-5 bg-card" aria-label="Verbale">
      <h3 className="font-headline text-2xl tracking-wider mb-2">Verbale della seduta</h3>
      <p role="alert" className="text-destructive text-sm">Modulo verbale non disponibile: occorre installare l'aggiornamento SQL della Fase 5.</p>
    </section>;
  }

  return (
    <section className="border border-border p-5 bg-card space-y-4" aria-label="Verbale della seduta">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-headline text-2xl tracking-wider">Verbale della seduta</h3>
        {mn && <span className="text-xs uppercase tracking-widest border border-border px-2 py-1">{MINUTES_STATUS[mn.status] ?? mn.status}</span>}
      </header>

      {!mn && manager && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={act.isPending}
            onClick={() => act.mutate(() => saveMinutes(m.id, "# Verbale\n\n", "manuale"))}>
            <FileText className="h-4 w-4 mr-2" />Scrivi il verbale manualmente
          </Button>
          <Button size="sm" disabled={act.isPending} onClick={() => act.mutate(() => draftMinutesWithAi(m.id))}>
            <Sparkles className="h-4 w-4 mr-2" />Genera bozza del verbale con IA
          </Button>
        </div>
      )}

      {mn && version && (
        <>
          <p className="text-sm text-muted-foreground">
            Versione {version.version} · {MINUTES_SOURCE[version.source]} · impronta {version.content_hash.slice(0, 8)}
            {version.locked_at ? " · bloccata per il voto" : ""}
          </p>
          {editable && !openBallot ? (
            <div className="space-y-2">
              <Textarea aria-label="Testo del verbale" className="min-h-[320px] font-mono text-sm"
                value={draft ?? version.body} onChange={(e) => setDraft(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={act.isPending || draft === null || draft.trim().length < 1}
                  onClick={() => act.mutate(() => saveMinutes(m.id, (draft ?? "").trim(), mn.status === "APPROVATO" ? "rettifica" : "manuale"))}>
                  Salva nuova versione
                </Button>
                <Button size="sm" variant="outline" disabled={act.isPending}
                  onClick={() => act.mutate(() => draftMinutesWithAi(m.id))}>
                  <Sparkles className="h-4 w-4 mr-2" />Rigenera bozza con IA
                </Button>
              </div>
            </div>
          ) : (
            <article className="border border-border p-4 bg-muted/40 max-h-[420px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-sans">{version.body}</pre>
            </article>
          )}

          {boardMember && !manager && ["BOZZA", "IN_REVISIONE"].includes(mn.status) && (
            <div className="space-y-2">
              <Textarea aria-label="Proposta di rettifica" placeholder="Proponi una rettifica al verbale (interventi, decisioni riportate…)"
                value={rectification} maxLength={4000} onChange={(e) => setRectification(e.target.value)} />
              <Button size="sm" variant="outline" disabled={act.isPending || rectification.trim().length < 5}
                onClick={() => act.mutate(() => rectifyMinutes(mn.id, rectification.trim()))}>
                Invia rettifica
              </Button>
            </div>
          )}

          {!!mn.board_minute_rectifications.length && (
            <ul className="space-y-2">
              {mn.board_minute_rectifications.map((r) => (
                <li key={r.id} className="border-l-2 border-border pl-3 text-sm">
                  <p><strong>{r.author_name}</strong> · {r.status === "nuova" ? "da valutare" : r.status === "accolta" ? "accolta" : "non accolta"}</p>
                  <p className="text-muted-foreground">{r.body}</p>
                  {manager && r.status === "nuova" && (
                    <div className="flex gap-2 mt-1">
                      <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => decideRectification(r.id, "accolta"))}>Accogli</Button>
                      <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => decideRectification(r.id, "non_accolta"))}>Non accogliere</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {president && live && !openBallot && ["BOZZA", "IN_REVISIONE"].includes(mn.status) && (
            <Button size="sm" disabled={act.isPending || !quorumMet} onClick={() => act.mutate(async () => { await submitMinutesVote(mn.id); })}>
              Sottoponi il verbale ad approvazione{!quorumMet ? " (quorum non raggiunto)" : ""}
            </Button>
          )}

          {openBallot && (
            <div className="border border-primary p-4 space-y-3" role="status">
              <p className="font-semibold">Votazione in corso sull'approvazione del verbale (versione {mn.current_version})</p>
              {boardMember && live && !myVote && (
                <div className="flex flex-wrap gap-2">
                  {(["favorevole", "contrario", "astenuto"] as const).map((v) => (
                    <Button key={v} size="sm" variant="outline" disabled={act.isPending}
                      onClick={() => act.mutate(() => castVote(openBallot.id, v))}>{VOTE_LABEL[v]}</Button>
                  ))}
                </div>
              )}
              {myVote && <p className="text-sm">Hai votato: <strong>{VOTE_LABEL[myVote.vote]}</strong> (puoi cambiare voto fino alla chiusura)</p>}
              {myVote && live && (
                <div className="flex flex-wrap gap-2">
                  {(["favorevole", "contrario", "astenuto"] as const).filter((v) => v !== myVote.vote).map((v) => (
                    <Button key={v} size="sm" variant="ghost" disabled={act.isPending}
                      onClick={() => act.mutate(() => castVote(openBallot.id, v))}>Cambia in {VOTE_LABEL[v]}</Button>
                  ))}
                </div>
              )}
              {president && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={act.isPending} onClick={() => act.mutate(() => closeBallot(openBallot.id))}>Chiudi la votazione</Button>
                  <Input className="max-w-xs" aria-label="Motivazione annullamento" placeholder="Motivazione annullamento"
                    value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                  <Button size="sm" variant="destructive" disabled={act.isPending || !cancelReason.trim()}
                    onClick={() => act.mutate(() => cancelBallot(openBallot.id, cancelReason.trim()))}>Annulla votazione</Button>
                </div>
              )}
            </div>
          )}

          {ballot.data && ballot.data.status === "chiusa" && (
            <p className="text-sm border-l-4 border-border pl-3">
              Esito della votazione: <strong>{BALLOT_RESULT[ballot.data.result ?? ""] ?? ballot.data.result}</strong>
              {ballot.data.tie_break ? " · decisivo il voto del Presidente" : ""} ·{" "}
              {(() => { const t = ballotTally(ballot.data as never); return `${t.favorevoli} favorevoli, ${t.contrari} contrari, ${t.astenuti} astenuti`; })()}
            </p>
          )}

          {mn.status === "APPROVATO" && (
            <div className="border border-border p-4 space-y-3 bg-muted/40">
              <p className="text-sm font-semibold">Verbale approvato: versione definitiva bloccata. Resta la sottoscrizione del Presidente e del verbalizzante.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline"
                  onClick={async () => downloadBlob(await minutesDocx(m, version.body, version.version), `Verbale_CD_${mn.number ?? "bozza"}_${m.meeting_year ?? ""}.docx`)}>
                  <Download className="h-4 w-4 mr-2" />Scarica per la firma (Word)
                </Button>
                {manager && (
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer border border-border px-3 py-2 hover:bg-muted">
                    <Upload className="h-4 w-4" />{mn.signed_path ? "Sostituisci la versione firmata" : "Carica la versione firmata"}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) act.mutate(() => registerSignedMinutes(mn.id, m.id, f)); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              {mn.signed_at && <p className="text-sm">Versione firmata registrata il {new Date(mn.signed_at).toLocaleDateString("it-IT")}.</p>}
              {manager && (
                <p className="text-xs text-muted-foreground">Per correggere il verbale approvato salva una «versione rettificata»: il testo torna in revisione e richiede una nuova approvazione.</p>
              )}
            </div>
          )}
        </>
      )}
      {mn && !version && <p className="text-sm text-muted-foreground">Il verbale è stato creato ma è ancora vuoto.</p>}
    </section>
  );
}
