import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ManagedMemberCard } from "@/lib/member-card-management";
import { appleWalletDownload, removeAppleWallet, saveGoogleWallet, uploadAppleWallet } from "@/lib/member-wallet";

export default function WalletCardEditor({ card, onSaved }: { card: ManagedMemberCard; onSaved: () => Promise<unknown> }) {
  const [google, setGoogle] = useState(card.google_wallet_url ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setGoogle(card.google_wallet_url ?? ""); }, [card.google_wallet_url]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await onSaved(); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operazione non riuscita."); }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy} className="border-t border-border mt-6 pt-5 min-w-0 space-y-4">
    <legend className="sr-only">Wallet tessera n. {card.card_number}</legend>
    <p className="font-medium">Tessera nel Wallet</p>
    <div>
      <Label htmlFor={`apple-${card.id}`}>Apple Wallet · file .pkpass (max 5 MB)</Label>
      <Input id={`apple-${card.id}`} className="mt-2 text-xs" type="file" accept=".pkpass,application/vnd.apple.pkpass" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void run(() => uploadAppleWallet(card.id, file), "Tessera Apple caricata e disponibile nell’Area Socio.");
      }} />
      <p className="text-sm text-muted-foreground mt-2">{card.apple_wallet_available ? "File Apple disponibile. Un nuovo caricamento sostituisce il precedente." : "File Apple non ancora caricato."}</p>
      {card.apple_wallet_available && <div className="flex flex-wrap gap-2 mt-2">
        <Button variant="outline" onClick={() => run(async () => { window.location.assign(await appleWalletDownload(card.id)); }, "")}>Scarica Apple</Button>
        <Button variant="outline" onClick={() => run(() => removeAppleWallet(card.id), "File Apple rimosso dall’Area Socio.")}>Rimuovi Apple</Button>
      </div>}
    </div>
    <form onSubmit={event => { event.preventDefault(); void run(() => saveGoogleWallet(card.id, google), google.trim() ? "Link Google salvato e disponibile nell’Area Socio." : "Link Google rimosso."); }} className="space-y-2">
      <Label htmlFor={`google-${card.id}`}>Google Wallet · link personale di salvataggio</Label>
      <Input id={`google-${card.id}`} type="url" maxLength={12000} value={google} onChange={event => setGoogle(event.target.value)} placeholder="https://pay.google.com/gp/v/save/…" />
      <p className="text-xs text-muted-foreground">Usa il link Google del socio, con lo stesso QR. Il file .pkpass è per Apple Wallet. Per rimuovere il link, svuota il campo e salva.</p>
      <Button type="submit" variant="outline">Salva link Google</Button>
    </form>
    {busy && <p role="status" className="text-sm">Salvataggio…</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset>;
}
