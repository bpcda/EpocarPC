import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
export { MEMBER_CARDS_OWNER_ID } from "../../setup/functions/member-card-management/owner";

const cardSchema = z.object({
  id: z.string().uuid(), full_name: z.string().min(1).max(200), category: z.string(), card_number: z.number().int().positive(),
  issued_at: z.string().datetime({ offset: true }), status: z.enum(["valid", "invalid", "unavailable"]),
  valid_until: z.string().optional(), renewal_due: z.boolean().optional(), svg: z.string().min(1).max(200000),
  url: z.string().regex(/^https:\/\/epocarpc\.com\/verifica-tessera#(?:v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{86}|v2\.[0-9a-f]{64})$/),
});
const pageSchema = z.object({ cards: cardSchema.array().max(50), next_cursor: z.string().uuid().nullable() });
export type ManagedMemberCard = z.infer<typeof cardSchema>;

export async function loadMemberCards(): Promise<ManagedMemberCard[]> {
  const cards: ManagedMemberCard[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  do {
    const { data, error } = await supabase.functions.invoke("member-card-management", { body: { after } });
    const parsed = pageSchema.safeParse(data);
    if (error || !parsed.success) throw new Error("Tessere non disponibili o accesso non autorizzato.");
    cards.push(...parsed.data.cards);
    after = parsed.data.next_cursor;
    if (after && cursors.has(after)) throw new Error("Elenco incompleto. Riprova tra poco.");
    if (after) cursors.add(after);
  } while (after);
  return cards.sort((a, b) => a.card_number - b.card_number);
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function qrPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Immagine non disponibile.")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 768;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Download PNG non disponibile in questo browser.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 768, 768); ctx.drawImage(image, 0, 0, 768, 768);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Download non riuscito.")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

export async function downloadMemberCard(card: ManagedMemberCard, format: "png" | "svg") {
  const blob = format === "png" ? await qrPng(card.svg) : new Blob([card.svg], { type: "image/svg+xml;charset=utf-8" });
  save(blob, `tessera-${String(card.card_number).padStart(4, "0")}.${format}`);
}

export async function downloadAllMemberCards(cards: ManagedMemberCard[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const card of cards) {
    const name = `tessera-${String(card.card_number).padStart(4, "0")}`;
    zip.file(`${name}.svg`, card.svg);
    zip.file(`${name}.png`, await qrPng(card.svg));
  }
  zip.file("elenco.txt", cards.map(card => `${card.card_number} · ${card.full_name} · ${card.category}`).join("\n"));
  zip.file("LEGGIMI.txt", "Pacchetto riservato al titolare: non pubblicarlo. Scansiona il QR con Pass2U senza modificarne il contenuto e distribuisci soltanto la tessera individuale. Il codice resta uguale ai rinnovi; il risultato della verifica online segue i dati della Tesoreria.\n");
  save(await zip.generateAsync({ type: "blob" }), "tessere-pass2u.zip");
}
