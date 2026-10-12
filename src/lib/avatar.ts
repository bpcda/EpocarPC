// App avatars live only in the private "avatars" bucket as `${userId}/profile.<ext>`.
// Provider (Google) photos are never used: external URLs are ignored everywhere.
export const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const isStorageAvatar = (v: string | null | undefined): v is string =>
  !!v && !/^[a-z]+:\/\//i.test(v) && !v.startsWith("data:");

async function sniff(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function validateAvatar(file: File): Promise<string | null> {
  if (!AVATAR_TYPES[file.type]) return "Formato non supportato: usa JPG, PNG o WebP.";
  if (file.size > AVATAR_MAX_BYTES) return "La foto supera i 5 MB.";
  if ((await sniff(file)) !== file.type) return "Il file non è un'immagine valida.";
  return null;
}

export const initials = (first?: string | null, last?: string | null, email?: string | null) =>
  ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase() || (email?.[0] ?? "?").toUpperCase();
