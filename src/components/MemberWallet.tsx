import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appleWalletDownload, loadMyWallet } from "@/lib/member-wallet";
import appleBadge from "@/assets/wallet/apple-wallet-it.svg";
import googleBadge from "@/assets/wallet/google-wallet-it.svg";

export default function MemberWallet({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: ["my-wallet", userId], queryFn: loadMyWallet, gcTime: 0, retry: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function apple() {
    if (busy) return;
    setBusy(true); setError("");
    try { window.location.assign(await appleWalletDownload()); }
    catch { setError("Download Apple Wallet non riuscito. Riprova tra poco."); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 border-t border-current/20 pt-5">
    <p className="font-medium">La tua tessera nel Wallet</p>
    {query.isPending ? <p role="status" className="text-sm mt-2">Caricamento tessera…</p> : query.isError ? <p role="alert" className="text-sm mt-2">Tessera Wallet non disponibile. <button className="underline min-h-11" onClick={() => query.refetch()}>Riprova</button></p> : <>
      {!query.data?.apple_available && !query.data?.google_url ? <p className="text-sm mt-2 opacity-75">La tessera è in preparazione. Quando sarà caricata potrai aggiungerla al Wallet da qui.</p> : <>
        <p className="text-sm mt-2 opacity-75">Aggiungi la tessera al Wallet del tuo telefono. Puoi recuperarla anche in seguito da questa pagina.</p>
        <div className="flex flex-wrap items-center gap-4 p-2 mt-2">
          {query.data?.apple_available && <button type="button" onClick={apple} aria-busy={busy} aria-disabled={busy} className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="Aggiungi a Apple Wallet">
            <img src={appleBadge} alt="Aggiungi a Apple Wallet" className="h-12 w-auto" height="48" />
          </button>}
          {query.data?.google_url && <a href={query.data.google_url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            <img src={googleBadge} alt="Aggiungi a Google Wallet" className="h-12 w-auto" height="48" />
          </a>}
        </div>
      </>}
    </>}
    {busy && <p role="status" className="text-sm mt-2">Apertura Apple Wallet…</p>}
    {error && <p role="alert" className="text-sm mt-2">{error}</p>}
  </div>;
}
