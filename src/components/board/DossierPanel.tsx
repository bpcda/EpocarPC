import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { archiveDossier, createDossier, downloadDossier, loadLatestDossier } from "@/lib/board-dossier";
import { downloadBlob } from "@/lib/board-docx";
import type { Meeting } from "@/lib/board";

export default function DossierPanel({ m, manager }: { m: Meeting; manager: boolean }) {
  const qc = useQueryClient();
  const dossier = useQuery({ queryKey: ["board-dossier", m.id], queryFn: () => loadLatestDossier(m.id) });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const frozen = ["ESPORTATO", "ARCHIVIATO"].includes(m.status);
  const act = useMutation({
    mutationFn: (f: () => Promise<void>) => f(),
    onSuccess: () => {
      setConfirmOpen(false); setVerified(false);
    },
    onSettled: async () => {
      await Promise.all(["board-dossier", "board-meetings", "board-session", "board-audio"].map((key) =>
        qc.invalidateQueries({ queryKey: key === "board-meetings" ? [key] : [key, m.id] })));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });
  const d = dossier.data;
  return <section className="border border-border p-5 bg-card space-y-4" aria-label="Fascicolo e archivio">
    <h3 className="font-headline text-2xl tracking-wider">Fascicolo e archivio della seduta</h3>
    <p className="text-sm">Raccogli convocazione, presenze, atti firmati, rettifiche, delibere con allegati, votazioni e registro in un unico ZIP. Il resoconto non approvato rimane indicato come tale. Audio e trascrizioni restano fuori dal fascicolo.</p>
    {dossier.isLoading && <p role="status">Caricamento fascicolo…</p>}
    {dossier.error && <p role="alert" className="text-sm text-destructive">Fascicolo non disponibile. Riprova tra poco.</p>}
    {m.status === "ARCHIVIATO" && <p role="status">Seduta archiviata: atti conservati e bloccati. Audio e trascrizioni temporanee sono stati eliminati.</p>}
    {m.status === "ESPORTATO" && <p role="status">Atti bloccati; eliminazione dei materiali temporanei da completare. Puoi riprendere l'archiviazione.</p>}
    <div className="flex flex-wrap gap-2">
      {manager && !frozen && <Button size="sm" disabled={act.isPending || dossier.isLoading || !!dossier.error}
        onClick={() => act.mutate(async () => { await createDossier(m.id); setDownloadedId(null); toast.success("Fascicolo pronto. Scaricalo e verifica gli atti prima di archiviare."); })}>
        {d ? "Rigenera fascicolo" : "Prepara fascicolo"}
      </Button>}
      {d && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(async () => {
        downloadBlob(await downloadDossier(d), `Fascicolo_CD_${m.meeting_number}_${m.meeting_year}.zip`);
        setDownloadedId(d.id);
      })}>Scarica fascicolo ZIP</Button>}
      {manager && d && !d.archived_at && m.status !== "ARCHIVIATO" && <Button size="sm" variant="outline"
        disabled={act.isPending || downloadedId !== d.id} onClick={() => { setVerified(false); setConfirmOpen(true); }}>
        {m.status === "ESPORTATO" ? "Riprendi archiviazione" : "Archivia seduta"}
      </Button>}
    </div>
    {!frozen && <p className="text-xs text-muted-foreground">Servono seduta chiusa e copie firmate degli atti. La chiusura senza approvazione deve essere motivata e non rende approvato il resoconto. Prima di archiviare, scarica il fascicolo e controllane il contenuto.</p>}
    {d && <p className="text-xs text-muted-foreground break-all">Fascicolo del {new Date(d.created_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} · SHA-256: {d.sha256}</p>}
    <Dialog open={confirmOpen} onOpenChange={(open) => { if (!act.isPending) setConfirmOpen(open); }}>
      <DialogContent><DialogHeader><DialogTitle>Archiviare la seduta?</DialogTitle>
        <DialogDescription>Il fascicolo e gli atti resteranno disponibili. Audio e trascrizioni temporanee saranno eliminati definitivamente; gli atti non saranno più modificabili.</DialogDescription>
      </DialogHeader>
        <label className="flex items-start gap-3 text-sm"><Checkbox checked={verified} disabled={act.isPending} onCheckedChange={(v) => setVerified(v === true)} />
          <span>Ho salvato e aperto il fascicolo ZIP e verificato verbale firmato, delibere e votazioni.</span>
        </label>
        <Button variant="destructive" disabled={!verified || act.isPending || !d || downloadedId !== d.id}
          onClick={() => { if (d) act.mutate(() => archiveDossier(d.id)); }}>
          {act.isPending ? "Archiviazione in corso…" : "Conferma archivio ed elimina audio e trascrizioni"}
        </Button>
      </DialogContent>
    </Dialog>
  </section>;
}
