export function socialUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function socialLinks(text: string): string[] {
  const urls = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const url = socialUrl(line.trim());
    if (!url || url.href.length > 2048) throw new Error("Inserisci un indirizzo web completo per ogni riga, ad esempio https://www.instagram.com/attivita.");
    urls.add(url.href);
  }
  return [...urls];
}

export async function benefitLogo(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Scegli un logo PNG, JPEG o WebP di massimo 5 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossibile leggere il logo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.82);
    if (!data.startsWith("data:image/webp;base64,") || data.length > 131072) throw new Error("Prova con un logo di dimensioni inferiori.");
    return data;
  } finally { bitmap.close(); }
}
