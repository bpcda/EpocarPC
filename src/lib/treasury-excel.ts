import JSZip from "jszip";
import { TEMPLATE_LIMITS } from "./treasury-template-lists";

/**
 * Export engine for the accountant's official workbook.
 * The template is never rebuilt: we copy the original zip and only replace
 * empty input cells and the four category fee values in Liste in the exported
 * copy only. Every formula is checked before and after.
 */
export const TEMPLATE_URL = "/templates/EPOCAR_Tesoreria_Rendiconto_template.xlsx";

export type CellValue = string | number | Date | null | undefined;
export type CellWrites = Record<string, Record<string, CellValue>>; // sheet name -> ref -> value
export type FormulaResults = Record<string, Record<string, string | number>>;

export const EXCEL_FEE_CELLS = { Fondatore: "L2", Ordinario: "L3", Sostenitore: "L4", Onorario: "L5" } as const;

// Explicit mapping: database field -> sheet -> column (input columns only).
export const EXCEL_MAPPING = {
  Movimenti: {
    firstRow: 2, lastRow: 2 + TEMPLATE_LIMITS.movements - 1,
    columns: { transaction_date: "A", movement_number: "B", type: "C", excel_code: "D", description: "G", subject: "H", document: "I", payment_method: "J", account: "K", amount: "L", event: "M", notes: "N" },
    readOnly: ["E", "F"],
  },
  "Quote Soci": {
    firstRow: 2, lastRow: 2 + TEMPLATE_LIMITS.members - 1,
    columns: { member_number: "A", full_name: "B", category: "C", admission_date: "D", last_payment_date: "H", notes: "J" },
    readOnly: ["E", "F", "G", "I"],
  },
  "Budget Previsionale": { firstRow: 5, lastRow: 62, codeColumn: "A", columns: { planned_amount: "C" }, readOnly: ["D", "E", "F"] },
} as const;

const parser = () => new DOMParser();

async function sheetFiles(zip: JSZip): Promise<Record<string, string>> {
  const wb = parser().parseFromString(await zip.file("xl/workbook.xml")!.async("string"), "application/xml");
  const rels = parser().parseFromString(await zip.file("xl/_rels/workbook.xml.rels")!.async("string"), "application/xml");
  const targets: Record<string, string> = {};
  Array.from(rels.getElementsByTagName("Relationship")).forEach((r) => {
    const t = r.getAttribute("Target")!;
    targets[r.getAttribute("Id")!] = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  });
  const out: Record<string, string> = {};
  Array.from(wb.getElementsByTagName("sheet")).forEach((s) => {
    const rid = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    out[s.getAttribute("name")!] = targets[rid!];
  });
  return out;
}

/** Every <f> element in every sheet, keyed by "Sheet!REF", including attributes (shared formulas). */
export async function extractFormulas(zip: JSZip): Promise<Map<string, string>> {
  const files = await sheetFiles(zip);
  const map = new Map<string, string>();
  for (const [name, path] of Object.entries(files)) {
    const xml = await zip.file(path)!.async("string");
    const re = /<c r="([A-Z]+[0-9]+)"((?: [a-zA-Z:]+="[^"]*")*)\s*(\/>|>((?:(?!<\/c>).)*)<\/c>)/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const f = m[4]?.match(/<f[^>]*?(?:\/>|>(?:(?!<\/f>).)*<\/f>)/s);
      if (f) map.set(`${name}!${m[1]}`, f[0]);
    }
  }
  return map;
}

export function compareFormulas(a: Map<string, string>, b: Map<string, string>): string[] {
  const diffs: string[] = [];
  if (a.size !== b.size) diffs.push(`Numero formule diverso: template ${a.size}, file ${b.size}`);
  for (const [k, v] of a) if (b.get(k) !== v) diffs.push(`Formula alterata o mancante in ${k}`);
  for (const k of b.keys()) if (!a.has(k)) diffs.push(`Formula aggiunta in ${k}`);
  return diffs;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function excelSerial(d: Date | string): number {
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  return (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Replace one EMPTY input cell, keeping its style. Refuses cells containing formulas or values. */
export function writeCell(xml: string, ref: string, value: CellValue): string {
  if (value === null || value === undefined || value === "") return xml;
  const re = new RegExp(`<c r="${ref}"((?: [a-zA-Z:]+="[^"]*")*)\\s*(/>|>((?:(?!</c>).)*)</c>)`, "s");
  const m = xml.match(re);
  if (!m) throw new Error(`Cella di input ${ref} non trovata nel template`);
  if (m[3] !== undefined && m[3].trim() !== "") throw new Error(`La cella ${ref} non è vuota nel template: scrittura rifiutata`);
  const style = m[1].match(/ s="(\d+)"/)?.[0] ?? "";
  let cell: string;
  if (value instanceof Date) {
    cell = `<c r="${ref}"${style}><v>${excelSerial(value)}</v></c>`;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Valore non valido per ${ref}`);
    cell = `<c r="${ref}"${style}><v>${value}</v></c>`;
  } else {
    cell = `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
  }
  return xml.replace(m[0], cell);
}

/** The only populated cells we may replace: category amounts in the exported copy. */
function writeFeeCell(xml: string, ref: string, value: CellValue): string {
  if (!Object.values(EXCEL_FEE_CELLS).some((cell) => cell === ref) || typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Quota non valida in Liste!${ref}`);
  }
  const re = new RegExp(`<c r="${ref}"((?: [a-zA-Z:]+="[^"]*")*)>(<v>[^<]*</v>)</c>`);
  const match = xml.match(re);
  if (!match) throw new Error(`Cella quota Liste!${ref} incompatibile con il template`);
  return xml.replace(match[0], `<c r="${ref}"${match[1]}><v>${value}</v></c>`);
}

/** Updates only a formula's cached result, leaving the formula itself byte-identical. */
function writeFormulaResult(xml: string, ref: string, value: string | number): string {
  const re = new RegExp(`<c r="${ref}"((?: [a-zA-Z:]+="[^"]*")*)>(?:(?!</c>).)*</c>`, "s");
  const match = xml.match(re);
  if (!match || !/<f[^>]*?(?:\/>|>(?:(?!<\/f>).)*<\/f>)/s.test(match[0])) throw new Error(`Formula ${ref} non trovata nel template`);
  const attrs = match[1].replace(/ t="[^"]*"/g, "");
  const body = match[0].slice(match[0].indexOf(">") + 1, -4);
  const cached = typeof value === "number" ? `<v>${value}</v>` : `<v>${esc(value)}</v>`;
  const updatedBody = /<v>[^<]*<\/v>/.test(body) ? body.replace(/<v>[^<]*<\/v>/, cached) : `${body}${cached}`;
  return xml.replace(match[0], `<c r="${ref}"${attrs}${typeof value === "string" ? ' t="str"' : ""}>${updatedBody}</c>`);
}

async function sharedStrings(zip: JSZip): Promise<string[]> {
  const f = zip.file("xl/sharedStrings.xml");
  if (!f) return [];
  const doc = parser().parseFromString(await f.async("string"), "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
}

/** Reads the budget code row index from the template (column A, rows 5-62). */
export async function budgetCodeRows(zip: JSZip): Promise<Record<string, number>> {
  const files = await sheetFiles(zip);
  const xml = await zip.file(files["Budget Previsionale"])!.async("string");
  const ss = await sharedStrings(zip);
  const out: Record<string, number> = {};
  const { firstRow, lastRow } = EXCEL_MAPPING["Budget Previsionale"];
  for (let r = firstRow; r <= lastRow; r++) {
    const m = xml.match(new RegExp(`<c r="A${r}"[^>]*t="s"[^>]*><v>(\\d+)</v></c>`));
    if (m) out[ss[Number(m[1])]] = r;
  }
  return out;
}

export async function loadTemplate(): Promise<{ zip: JSZip; bytes: ArrayBuffer }> {
  const res = await fetch(TEMPLATE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Template Excel ufficiale non disponibile");
  const bytes = await res.arrayBuffer();
  return { zip: await JSZip.loadAsync(bytes), bytes };
}

/** Copies the template, writes inputs/yearly fee values and verifies formulas are byte-identical. */
export async function buildWorkbook(writes: CellWrites, formulaResults: FormulaResults = {}): Promise<Blob> {
  return new Blob([await buildWorkbookBytes(writes, formulaResults)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function buildWorkbookBytes(writes: CellWrites, formulaResults: FormulaResults = {}): Promise<ArrayBuffer> {
  const { bytes } = await loadTemplate();
  const original = await JSZip.loadAsync(bytes);
  const copy = await JSZip.loadAsync(bytes);
  const before = await extractFormulas(original);
  const files = await sheetFiles(copy);

  for (const [sheet, cells] of Object.entries(writes)) {
    if (sheet === "Liste") {
      const path = files[sheet];
      const entry = copy.file(path);
      if (!entry) throw new Error("Foglio Liste non disponibile nel template");
      let xml = await entry.async("string");
      for (const [ref, value] of Object.entries(cells)) {
        if (before.has(`${sheet}!${ref}`)) throw new Error(`${sheet}!${ref} contiene una formula: scrittura rifiutata`);
        xml = writeFeeCell(xml, ref, value);
      }
      copy.file(path, xml);
      continue;
    }
    const mapping = EXCEL_MAPPING[sheet as keyof typeof EXCEL_MAPPING];
    if (!mapping) throw new Error(`Il foglio ${sheet} non è un foglio di input`);
    const path = files[sheet];
    let xml = await copy.file(path)!.async("string");
    for (const [ref, value] of Object.entries(cells)) {
      const col = ref.replace(/\d+/g, ""), row = Number(ref.replace(/\D+/g, ""));
      const allowed = Object.values(mapping.columns) as string[];
      if (!allowed.includes(col) || row < mapping.firstRow || row > mapping.lastRow) throw new Error(`Scrittura non consentita in ${sheet}!${ref}`);
      if (before.has(`${sheet}!${ref}`)) throw new Error(`${sheet}!${ref} contiene una formula: scrittura rifiutata`);
      xml = writeCell(xml, ref, value);
    }
    copy.file(path, xml);
  }

  for (const [sheet, cells] of Object.entries(formulaResults)) {
    if (sheet !== "Quote Soci") throw new Error(`Risultati formula non consentiti nel foglio ${sheet}`);
    const path = files[sheet];
    let xml = await copy.file(path)!.async("string");
    for (const [ref, value] of Object.entries(cells)) {
      const col = ref.replace(/\d+/g, ""), row = Number(ref.replace(/\D+/g, ""));
      if (!["E", "F", "G", "I"].includes(col) || row < EXCEL_MAPPING["Quote Soci"].firstRow || row > EXCEL_MAPPING["Quote Soci"].lastRow || !before.has(`${sheet}!${ref}`)) {
        throw new Error(`Risultato formula non consentito in ${sheet}!${ref}`);
      }
      xml = writeFormulaResult(xml, ref, value);
    }
    copy.file(path, xml);
  }

  // Ask Excel to recompute the accountant's formulas on open (no formula is changed).
  const wbXml = await copy.file("xl/workbook.xml")!.async("string");
  copy.file("xl/workbook.xml", wbXml.replace(/<calcPr(?![^>]*fullCalcOnLoad)([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>'));

  const out = await copy.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  const reloaded = await JSZip.loadAsync(out);
  const diffs = compareFormulas(before, await extractFormulas(reloaded));
  const names = (z: JSZip) => Object.values(z.files).filter((f) => !f.dir).map((f) => f.name).sort().join("|");
  const origNames = names(original), newNames = names(reloaded);
  if (origNames !== newNames) diffs.push("Struttura del file diversa dal template");
  const touched = new Set([...Object.keys(writes).map((s) => files[s]), ...Object.keys(formulaResults).map((s) => files[s]), "xl/workbook.xml"]);
  for (const name of Object.keys(original.files)) {
    if (touched.has(name) || original.files[name].dir) continue;
    const [a, b] = await Promise.all([original.file(name)!.async("uint8array"), reloaded.file(name)!.async("uint8array")]);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) diffs.push(`Parte del file modificata: ${name}`);
  }
  if (diffs.length) throw new Error(`Controllo integrità fallito, export interrotto:\n${diffs.slice(0, 10).join("\n")}`);
  return out;
}
