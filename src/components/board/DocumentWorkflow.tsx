import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/board-docx";
import { loadDocumentWorkflow, requestDocuments, cancelDocuments, pairDocumentWorker, revokeDocumentWorker, reviewPackage } from "@/lib/board-workflow";
import type { Meeting, Minutes } from "@/lib/board";
import { loadAudioData } from "@/lib/board-audio";

const labels: Record<string, string> = { pending: "In attesa della routine", transcribing: "Trascrizione", drafting: "Redazione con Codex", ready: "Pronto da rivedere", stale: "Fonti cambiate: controlla il risultato", failed: "Intervento richiesto", cancelled: "Annullato" };
export default function DocumentWorkflow({ m, manager, minutes, unsaved = false }: { m: Meeting; manager: boolean; minutes?: Minutes | null; unsaved?: boolean }) {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false), [note, setNote] = useState(""), [phone, setPhone] = useState("");
  const data = useQuery({ queryKey: ["board-document-workflow", m.id], queryFn: () => loadDocumentWorkflow(m.id), refetchInterval: 5000 });
  const audio = useQuery({ queryKey: ["board-audio", m.id], queryFn: () => loadAudioData(m.id) });
  const act = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["board-document-workflow", m.id] }); await qc.invalidateQueries({ queryKey: ["board-minutes", m.id] }); }, onError: e => toast.error(e instanceof Error ? e.message : "Operazione non riuscita") });
  const current = data.data?.jobs[0];
  useEffect(() => {
    if (current?.status === "ready") { void qc.invalidateQueries({ queryKey: ["board-minutes", m.id] }); void qc.invalidateQueries({ queryKey: ["board-audio", m.id] }); }
  }, [current?.id, current?.status, m.id, qc]);
  const active = !!current && ["pending", "transcribing", "drafting"].includes(current.status);
  const editable = !minutes?.signed_path && (!minutes || ["BOZZA", "IN_REVISIONE"].includes(minutes.status));
  return <div className="rounded-lg border border-border p-4 space-y-3">
    <div><h4 className="font-semibold">Prepara documenti</h4><p className="text-sm text-muted-foreground">Trascrizione, bozza Codex e pacchetto di revisione. Puoi completare il verbale anche dopo la chiusura.</p></div>
    {data.error && <p role="alert" className="text-sm text-destructive">Routine non disponibile. Il verbale manuale resta utilizzabile.</p>}
    {data.data && <p className="text-sm text-muted-foreground" role="status">{data.data.worker.online ? "Routine collegata" : data.data.worker.paired ? "PC non collegato: i lavori restano in attesa" : "Collega una volta il PC per usare la routine"}</p>}
    {current && <div role="status" className="space-y-2 text-sm"><strong>{labels[current.status] ?? current.status}</strong>{current.error && <p>{current.error}</p>}{!!current.review_notes.length && <ul className="list-disc pl-5">{current.review_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}{current.status === "stale" && current.result && <details><summary className="cursor-pointer">Bozza conservata, non applicata</summary><pre className="whitespace-pre-wrap font-sans">{current.result}</pre></details>}</div>}
    {manager && editable && !active && <>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} />Ho terminato e caricato le registrazioni; ho verificato le fonti e indico sotto eventuali parti da integrare.</label>
      <Textarea aria-label="Copertura delle fonti e integrazioni manuali" placeholder="Parti non registrate, osservazioni o appunti da includere (obbligatori se manca l’audio)" value={note} maxLength={1900} onChange={e => setNote(e.target.value)} />
      <Button disabled={act.isPending || !confirmed || !data.data?.worker.paired || unsaved || !audio.data || !audio.data.tracks.length && note.trim().length < 5} onClick={() => act.mutate(() => requestDocuments(m.id, note.trim() || "Fonti audio disponibili verificate; rivedere attribuzioni e completezza prima delle firme."))}>Prepara documenti con Codex</Button>
      {unsaved && <p className="text-sm text-muted-foreground">Salva le modifiche prima di avviare la routine.</p>}
    </>}
    {manager && active && <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate(() => cancelDocuments(current.id))}>Annulla elaborazione</Button>}
    {minutes && minutes.current_version > 0 && <Button variant="outline" disabled={act.isPending || unsaved} onClick={() => act.mutate(async () => downloadBlob(await reviewPackage(m, minutes, current?.review_notes ?? []), `Revisione_CD_${m.meeting_number ?? "bozza"}_${m.meeting_year ?? ""}_v${minutes.current_version}.zip`))}>Scarica pacchetto per revisione</Button>}
    {manager && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Collegamento del PC e avvisi WhatsApp</summary><div className="mt-3 space-y-3">
      <p>Una sola configurazione sul tuo PC. Codex usa il tuo piano; la trascrizione avviene localmente. Il PC deve restare acceso. Collegarlo nuovamente revoca la configurazione precedente dello stesso account.</p>
      <label className="block">Il tuo numero WhatsApp per gli avvisi (facoltativo)<Input aria-label="Numero WhatsApp per gli avvisi" placeholder="+39…" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <p className="text-xs text-muted-foreground">Indicando il numero richiedi gli avvisi sui documenti preparati. Il messaggio contiene soltanto un link all’area riservata.</p>
      <Button variant="outline" size="sm" disabled={act.isPending || active} onClick={() => act.mutate(async () => downloadBlob(await pairDocumentWorker(m.id, phone.trim()), "epocar-board-worker.json"))}>Collega questo PC</Button>
      <p>Importa il file con la procedura locale descritta nella guida della routine; poi eliminalo dai download se non viene rimosso automaticamente.</p>
      <Button variant="ghost" size="sm" disabled={act.isPending} onClick={() => act.mutate(revokeDocumentWorker)}>Revoca il collegamento di questo account</Button>
    </div></details>}
  </div>;
}
