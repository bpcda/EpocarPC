import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { accountStatus, describeStatus, type AccountStatus } from "@/lib/account-deletion";

export const PRIVACY_NOTE =
  "L'eliminazione dell'account non comporta necessariamente la cancellazione di dati che l'Associazione è tenuta a conservare per obblighi amministrativi, contabili o statutari.";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "self" | "admin";
  targetUserId?: string;
  targetLabel?: string;
  phrase: string;
  onConfirm: () => Promise<void>;
}

export default function DeleteAccountDialog({ open, onOpenChange, mode, targetUserId, targetLabel, phrase, onConfirm }: Props) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAck(false); setTyped(""); setError(null); setStatus(null); setStatusError(null);
    accountStatus(mode === "admin" ? targetUserId : undefined).then(setStatus, (e) => setStatusError(e.message));
  }, [open, mode, targetUserId]);

  const kind = describeStatus(status);
  const canConfirm = ack && typed.trim() === phrase && !busy && !status?.last_admin && !statusError && !!status;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true); setError(null);
    try { await onConfirm(); onOpenChange(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita."); }
    finally { setBusy(false); }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{mode === "self" ? "Eliminare definitivamente il tuo account?" : `Eliminare l'account portale di ${targetLabel}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {mode === "self" ? (
                <p>L'eliminazione dell'account rimuove l'accesso al portale EPOCAR e i dati strettamente collegati al profilo online. Se sei già socio dell'Associazione, la cancellazione dell'account non equivale al recesso dall'Associazione.</p>
              ) : (
                <p>Questa operazione elimina l'accesso al portale ma non modifica la posizione associativa nella Tesoreria.</p>
              )}
              {!status && !statusError && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verifica dell'account…</p>}
              {statusError && <p className="text-destructive">{statusError}</p>}
              {status?.last_admin && <p className="text-destructive font-medium">Non puoi eliminare l'ultimo amministratore del sistema.</p>}
              {status && !status.last_admin && (
                <p className="border border-border p-2">
                  {kind === "member" && (mode === "self"
                    ? "Risulti socio: verrà eliminato soltanto il tuo account online. La tua posizione associativa resta invariata. Per recedere dall'Associazione serve una richiesta separata."
                    : "Questo utente risulta socio. Verrà eliminato soltanto l'account online. La posizione associativa resta nella Tesoreria.")}
                  {kind === "pending" && "C'è una domanda di ammissione in corso: verrà ritirata (stato Annullata) e ne resterà traccia."}
                  {kind === "draft" && "C'è una bozza di domanda non inviata: verrà eliminata."}
                  {kind === "user" && (mode === "self" ? "Nessuna domanda di ammissione in corso." : "Solo utente del portale, nessuna domanda in corso.")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Verranno eliminati foto profilo, profilo, veicoli e ruoli del portale; le iscrizioni agli eventi restano anonime. {PRIVACY_NOTE}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            <span>Ho letto e capito che l'operazione è definitiva e non si può annullare.</span>
          </label>
          <div>
            <p className="text-xs mb-1">Per confermare scrivi <strong>{phrase}</strong></p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Frase di conferma" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <Button variant="destructive" disabled={!canConfirm} onClick={confirm}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "self" ? "Elimina definitivamente il mio account" : "Elimina account portale"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
