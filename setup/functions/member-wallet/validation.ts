export const MAX_APPLE_PASS_BYTES = 5 * 1024 * 1024;
export const WALLET_BUCKET = "member-wallet-passes";

export function googleWalletUrl(value: string, expectedQr?: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Usa il link ufficiale Salva in Google Wallet del singolo socio."); }
  if (url.origin !== "https://pay.google.com" || url.username || url.password || url.search || url.hash || value.length > 12000
    || !/^\/gp\/v\/save\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.pathname)) {
    throw new Error("Usa il link ufficiale Salva in Google Wallet del singolo socio.");
  }
  const parts = url.pathname.split("/").pop()!.split(".");
  const decode = (part: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")), c => c.charCodeAt(0))));
  let header, payload;
  try { header = decode(parts[0]); payload = decode(parts[1]); }
  catch { throw new Error("Il link Google Wallet non è valido."); }
  if (header?.alg !== "RS256" || payload?.aud !== "google" || payload?.typ !== "savetowallet" || typeof payload?.iss !== "string" || !payload.iss) {
    throw new Error("Il link non contiene una tessera Google Wallet valida.");
  }
  if (payload.exp !== undefined && (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000)) throw new Error("Il link Google Wallet è scaduto.");
  if (expectedQr && payload.payload && typeof payload.payload === "object") {
    const values = Object.values(payload.payload).flatMap(items => Array.isArray(items) ? items.map(item => item?.barcode?.value).filter(value => typeof value === "string") : []);
    if (values.some(value => value !== expectedQr)) throw new Error("Il QR del link Google Wallet non corrisponde al socio selezionato.");
  }
  return url.href;
}
