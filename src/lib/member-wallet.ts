import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { googleWalletUrl, MAX_APPLE_PASS_BYTES } from "../../setup/functions/member-wallet/validation";

const walletSchema = z.object({ apple_available: z.boolean(), google_url: z.string().nullable() });

async function invoke(body: object | FormData) {
  const { data, error } = await supabase.functions.invoke("member-wallet", { body });
  if (error) {
    let message = "Operazione Wallet non riuscita. Riprova tra poco.";
    if (error.context instanceof Response) {
      try { const json = await error.context.json(); if (typeof json.message === "string" && json.message.length < 300) message = json.message; } catch { /* Use the safe fallback. */ }
    }
    throw new Error(message);
  }
  return data;
}

export async function loadMyWallet() {
  const parsed = walletSchema.safeParse(await invoke({ action: "get" }));
  if (!parsed.success) throw new Error("Tessera Wallet non disponibile.");
  return { ...parsed.data, google_url: parsed.data.google_url ? googleWalletUrl(parsed.data.google_url) : null };
}

export async function appleWalletDownload(memberId?: string) {
  const data = z.object({ url: z.string().url() }).parse(await invoke({ action: "apple", ...(memberId ? { member_id: memberId } : {}) }));
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin || !url.pathname.startsWith("/storage/v1/object/sign/member-wallet-passes/")) throw new Error("Download non disponibile.");
  return url.href;
}

export async function uploadAppleWallet(memberId: string, file: File) {
  if (!file.name.toLowerCase().endsWith(".pkpass") || !file.size || file.size > MAX_APPLE_PASS_BYTES) throw new Error("Carica un file .pkpass, massimo 5 MB.");
  const form = new FormData(); form.append("member_id", memberId); form.append("file", file);
  await invoke(form);
}
export async function removeAppleWallet(memberId: string) { await invoke({ action: "remove_apple", member_id: memberId }); }
export async function saveGoogleWallet(memberId: string, value: string) {
  const url = value.trim() ? googleWalletUrl(value) : null;
  await invoke({ action: "set_google", member_id: memberId, url });
}
