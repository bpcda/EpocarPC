import JSZip from "jszip";
import { MAX_APPLE_PASS_BYTES } from "./validation.ts";

// Stream decompression is bounded independently from the compressed upload size.
function unpack(entry: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    // JSZip's declarations omit this streaming file API; avoid unbounded async() decompression.
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream("uint8array");
    stream.on("data", chunk => {
      size += chunk.length;
      if (size > limit) { stream.pause(); reject(new Error("Contenuto del file troppo grande.")); return; }
      chunks.push(chunk);
    }).on("error", reject).on("end", () => {
      const result = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      resolve(result);
    }).resume();
  });
}

export async function validateApplePass(bytes: Uint8Array, expectedQr: string) {
  if (bytes.length > MAX_APPLE_PASS_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Carica un file .pkpass valido, massimo 5 MB.");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error("Il file .pkpass non è leggibile."); }
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  if (entries.length > 128 || entries.some(entry => entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").includes("..") || entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) throw new Error("Contenuto del file .pkpass non valido.");
  if (!zip.file("pass.json") || !zip.file("manifest.json") || !zip.file("signature")) throw new Error("Mancano i dati o la firma della tessera Apple Wallet.");
  let manifest, pass;
  try {
    manifest = JSON.parse(new TextDecoder().decode(await unpack(zip.file("manifest.json")!, 256 * 1024)));
    pass = JSON.parse(new TextDecoder().decode(await unpack(zip.file("pass.json")!, 256 * 1024)));
  } catch { throw new Error("I dati del file Apple Wallet non sono leggibili."); }
  if (!pass || typeof pass !== "object") throw new Error("I dati Apple Wallet del file non sono validi.");
  if (pass.formatVersion !== 1 || typeof pass.passTypeIdentifier !== "string" || !pass.passTypeIdentifier.startsWith("pass.")
    || typeof pass.teamIdentifier !== "string" || typeof pass.serialNumber !== "string") throw new Error("I dati Apple Wallet del file non sono validi.");
  const codes = [...(Array.isArray(pass.barcodes) ? pass.barcodes : []), ...(pass.barcode ? [pass.barcode] : [])];
  if (!codes.length || codes.some(code => code?.format !== "PKBarcodeFormatQR" || code?.message !== expectedQr)) throw new Error("Il QR della tessera Apple non corrisponde al socio selezionato.");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Manifest della tessera non valido.");
  const content = entries.filter(entry => !["manifest.json", "signature"].includes(entry.name));
  if (Object.keys(manifest).length !== content.length) throw new Error("Contenuto della tessera incompleto.");
  let total = 0;
  for (const entry of content) {
    const data = await unpack(entry, Math.min(MAX_APPLE_PASS_BYTES, 20 * 1024 * 1024 - total));
    total += data.length;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    if (typeof manifest[entry.name] !== "string" || manifest[entry.name].toLowerCase() !== hash) throw new Error("Il file Apple Wallet è danneggiato.");
  }
  if (!(await unpack(zip.file("signature")!, 128 * 1024)).length) throw new Error("La firma della tessera è assente.");
  // Apple Wallet validates the issuer's cryptographic signature on installation; never rewrite the pass.
}
