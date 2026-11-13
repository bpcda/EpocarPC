import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adoptCorrection,
  loadCorrectedMinutes,
  loadCorrections,
  rejectCorrection,
  type Meeting,
} from "@/lib/board";
import MinutesPanel from "./MinutesPanel";

export default function CorrectionsPanel({
  m,
  me,
  president,
  manager,
  boardMember,
  live,
  quorumMet,
  eligible,
}: {
  m: Meeting;
  me: string;
  president: boolean;
  manager: boolean;
  boardMember: boolean;
  live: boolean;
  quorumMet: boolean;
  eligible: boolean;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const proposals = useQuery({
    queryKey: ["board-corrections"],
    queryFn: loadCorrections,
  });
  const documents = useQuery({
    queryKey: ["board-corrected-minutes", m.id],
    queryFn: () => loadCorrectedMinutes(m.id),
  });
  const action = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: async () => {
      setReason("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["board-corrections"] }),
        qc.invalidateQueries({ queryKey: ["board-corrected-minutes", m.id] }),
      ]);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });
  return (
    <section className="space-y-4" aria-label="Rettifiche di sedute precedenti">
      <h3 className="font-headline text-2xl">
        Rettifiche di sedute precedenti
      </h3>
      {(proposals.error || documents.error) && (
        <p role="alert">Rettifiche non disponibili. Riprova.</p>
      )}
      {manager &&
        !m.ended_at &&
        proposals.data
          ?.filter(
            (c) => c.status === "proposta" && c.origin.meeting_id !== m.id,
          )
          .map((c) => (
            <article key={c.id} className="border border-border p-4 space-y-2">
              <p>
                Verbale n. {c.origin.number ?? "—"}/
                {c.origin.board_meetings.meeting_year ?? "—"}, versione{" "}
                {c.origin_version}
              </p>
              <p>{c.reason}</p>
              <details>
                <summary>Testo completo proposto</summary>
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {c.body}
                </pre>
              </details>
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate(() => adoptCorrection(c.id, m.id))}
              >
                Tratta in questa seduta
              </Button>
              <Input
                aria-label={`Motivo del rifiuto ${c.id}`}
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo dell'eventuale rifiuto"
              />
              <Button
                variant="outline"
                disabled={action.isPending || !reason.trim()}
                onClick={() =>
                  action.mutate(() => rejectCorrection(c.id, m.id, reason))
                }
              >
                Non accogliere
              </Button>
            </article>
          ))}
      {documents.data?.map((d) => (
        <MinutesPanel
          key={d.id}
          m={m}
          me={me}
          president={president}
          manager={manager}
          boardMember={boardMember}
          live={live}
          quorumMet={quorumMet}
          eligible={eligible}
          minutesId={d.id}
        />
      ))}
    </section>
  );
}
