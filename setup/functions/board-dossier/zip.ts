import JSZip from "jszip";

export const MAX_DOSSIER_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}

type Snapshot = {
  schema_version: number;
  meeting: { id: string; meeting_number: number; meeting_year: number; scheduled_at: string; location: string | null; mode: string; started_at: string; ended_at: string };
  participants: { display_name: string; kind: string; board_roles: string[]; present: boolean; attendance_mode: string | null }[];
  agenda: { position: number; title: string; description: string | null; proposal: string | null }[];
  minutes: { current_version: number; signed_path: string; versions: { version: number; body: string }[] };
  deliberations: { number: number; title: string; status: string; current_version: number; versions: { version: number; body: string }[] }[];
  ballots: unknown[]; events: unknown[]; recording_consents: unknown[];
};

export async function buildDossierZip(snapshot: string, signed: Uint8Array): Promise<Uint8Array> {
  const data: Snapshot = JSON.parse(snapshot);
  if (data.schema_version !== 1 || !data.minutes?.signed_path || !data.meeting?.id) throw new Error("Dati del fascicolo non validi");
  if (encoder.encode(snapshot).length > 10 * 1024 * 1024 || signed.length > 10 * 1024 * 1024) {
    throw new Error("Fascicolo troppo grande: dati o verbale firmato oltre 10 MB");
  }
  const extension = data.minutes.signed_path.split(".").pop();
  const validSignature = extension === "pdf" ? new TextDecoder().decode(signed.slice(0, 5)) === "%PDF-"
    : extension === "png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => signed[i] === b)
    : ["jpg", "jpeg"].includes(extension ?? "") && signed[0] === 255 && signed[1] === 216 && signed[2] === 255;
  if (!validSignature) throw new Error("La copia firmata deve essere un PDF, JPEG o PNG valido");
  const version = data.minutes.versions.find((v) => v.version === data.minutes.current_version);
  if (!version) throw new Error("Versione corrente del verbale mancante");
  const title = `EPOCAR — Consiglio Direttivo n. ${data.meeting.meeting_number}/${data.meeting.meeting_year}`;
  const files: Record<string, Uint8Array> = {};
  const text = (name: string, content: string) => { files[name] = encoder.encode(content); };
  const json = (name: string, content: unknown) => text(name, JSON.stringify(content, null, 2));
  text("00_LEGGIMI.txt", `${title}\n\nIl fascicolo contiene gli atti della seduta e la copia firmata del verbale.\nAudio e trascrizioni temporanee non sono inclusi.\nI documenti citati nelle delibere sono elencati nei dati della seduta; i relativi file vanno conservati insieme agli atti.\nmanifest.json riporta dimensioni e impronte SHA-256 dei file.\nDate e orari nei dati JSON sono conservati nel formato originale, con fuso orario.\n`);
  text("01_Convocazione.txt", `${title}\nData: ${data.meeting.scheduled_at}\nLuogo: ${data.meeting.location ?? "—"}\nModalità: ${data.meeting.mode}\n\nOrdine del giorno\n${data.agenda.map((a) => `${a.position}. ${a.title}\n${a.description ?? ""}\n${a.proposal ?? ""}`).join("\n\n")}`);
  text("02_Presenze.txt", `${title}\nApertura: ${data.meeting.started_at}\nChiusura: ${data.meeting.ended_at}\n\n${data.participants.map((p) => `${p.display_name} — ${p.kind === "guest" ? "Invitato senza voto" : p.board_roles.join(", ")} — ${p.present ? "Presenza confermata" : "Non presente alla chiusura"}${p.attendance_mode ? ` (${p.attendance_mode})` : ""}`).join("\n")}\n\nIngressi, uscite e verifiche del quorum sono documentati nel registro della seduta.`);
  text("03_Verbale.txt", `${title}\nVersione ${version.version}\n\n${version.body}`);
  for (const d of data.deliberations) {
    const v = d.versions.find((v) => v.version === d.current_version);
    if (!v) throw new Error(`Versione corrente della delibera ${d.number} mancante`);
    text(`04_Delibere/${d.number}.txt`, `${title}\nDelibera ${d.number}: ${d.title}\nStato: ${d.status}\nVersione: ${d.current_version}\n\n${v.body}`);
  }
  json("05_Votazioni.json", data.ballots);
  json("06_Registro.json", data.events);
  json("07_Consensi.json", data.recording_consents);
  text("dati-seduta.json", snapshot);
  files[`Verbale_firmato.${extension}`] = signed;
  const manifest = { schema_version: 1, meeting_id: data.meeting.id, files: [] as { path: string; bytes: number; sha256: string }[] };
  const zip = new JSZip();
  for (const [path, bytes] of Object.entries(files)) {
    manifest.files.push({ path, bytes: bytes.length, sha256: await sha256(bytes) });
    zip.file(path, bytes);
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (bytes.length > MAX_DOSSIER_BYTES) throw new Error("Fascicolo oltre il limite di 25 MB");
  return bytes;
}

export async function verifyDossierZip(bytes: Uint8Array, snapshot: string, expectedHash: string) {
  if (bytes.length > MAX_DOSSIER_BYTES || await sha256(bytes) !== expectedHash) throw new Error("Impronta del fascicolo non corrispondente");
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const savedSnapshot = await zip.file("dati-seduta.json")?.async("string");
  if (savedSnapshot !== snapshot) throw new Error("I dati della seduta non corrispondono al fascicolo");
  const data: Snapshot = JSON.parse(snapshot);
  const manifest = JSON.parse(await zip.file("manifest.json")?.async("string") ?? "null");
  if (manifest?.schema_version !== 1 || manifest.meeting_id !== data.meeting.id || !Array.isArray(manifest.files)) {
    throw new Error("Indice del fascicolo non valido");
  }
  const listed = new Set<string>();
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || listed.has(entry.path)) throw new Error("Indice del fascicolo non valido");
    listed.add(entry.path);
    const content = await zip.file(entry.path)?.async("uint8array");
    if (!content || content.length !== entry.bytes || await sha256(content) !== entry.sha256) throw new Error("File del fascicolo non integro");
  }
  const actual = Object.values(zip.files).filter((f) => !f.dir && f.name !== "manifest.json");
  const required = ["00_LEGGIMI.txt", "01_Convocazione.txt", "02_Presenze.txt", "03_Verbale.txt",
    "05_Votazioni.json", "06_Registro.json", "07_Consensi.json", "dati-seduta.json",
    `Verbale_firmato.${data.minutes.signed_path.split(".").pop()}`, ...data.deliberations.map((d) => `04_Delibere/${d.number}.txt`)];
  if (actual.length !== listed.size || required.some((path) => !listed.has(path))) {
    throw new Error("Il fascicolo non contiene tutti gli atti previsti");
  }
}
