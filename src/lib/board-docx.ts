// Generates the official convocation (EPOCAR template 01_Convocazione_e_ODG) from meeting data.
import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, ShadingType } from "docx";
import { AGENDA_KINDS, MODE_LABEL, romeDate, romeTime, type Meeting } from "@/lib/board";

const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text: string, width: number, head = false) => new TableCell({
  borders, width: { size: width, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
  shading: head ? { fill: "EFE7DA", type: ShadingType.CLEAR } : undefined,
  children: [new Paragraph({ children: [new TextRun({ text, bold: head })] })],
});

export function convocationRows(m: Meeting): [string, string][] {
  const place = [m.location, m.video_link].filter(Boolean).join(" · ") || "—";
  const rows: [string, string][] = [
    ["Data", romeDate(m.scheduled_at)], ["Ora", romeTime(m.scheduled_at)],
    ["Luogo / piattaforma", place], ["Modalità", MODE_LABEL[m.mode]],
  ];
  if (m.urgency_reason) rows.push(["Eventuale urgenza", m.urgency_reason]);
  return rows;
}

export async function convocationDocx(m: Meeting): Promise<Blob> {
  const num = m.meeting_number ? `${m.meeting_number}/${m.meeting_year}` : "[bozza]";
  const p = (text: string, opts: { bold?: boolean; after?: number } = {}) =>
    new Paragraph({ spacing: { after: opts.after ?? 160 }, children: [new TextRun({ text, bold: opts.bold })] });
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`Oggetto: Convocazione del Consiglio Direttivo EPOCAR – riunione n. ${num}`)] }),
    p("Ai componenti del Consiglio Direttivo"),
    p("Il Presidente, ai sensi dell’art. 17 dello Statuto, convoca il Consiglio Direttivo dell’Associazione EPOCAR alle condizioni di seguito indicate."),
    new Table({
      width: { size: 9360, type: WidthType.DXA }, columnWidths: [3400, 5960],
      rows: [new TableRow({ children: [cell("Informazione", 3400, true), cell("Dato", 5960, true)] }),
        ...convocationRows(m).map(([k, v]) => new TableRow({ children: [cell(k, 3400), cell(v, 5960)] }))],
    }),
  ];
  if (m.description) children.push(new Paragraph({ spacing: { before: 200, after: 160 }, children: [new TextRun(m.description)] }));
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun("Ordine del giorno")] }));
  for (const a of m.board_agenda_items) {
    children.push(new Paragraph({ numbering: { reference: "odg", level: 0 }, children: [
      new TextRun({ text: a.title, bold: true }), new TextRun({ text: ` (${AGENDA_KINDS[a.kind] ?? a.kind})` })] }));
    if (a.description) children.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun(a.description)] }));
    if (a.proposal) children.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: `Proposta di deliberazione: ${a.proposal}`, italics: true })] }));
  }
  const guests = m.board_meeting_participants.filter((x) => x.kind === "guest");
  if (guests.length) children.push(p(`Invitati senza diritto di voto: ${guests.map((g) => g.display_name).join(", ")}.`));
  children.push(
    p("Si chiede ai consiglieri di confermare la ricezione della convocazione e l’eventuale impossibilità a partecipare."),
    p(`Luogo e data: Piacenza, ${romeDate(new Date().toISOString())}`),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 400 }, children: [new TextRun("Il Presidente ______________________________")] }),
  );
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    numbering: { config: [{ reference: "odg", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1270, right: 1270, bottom: 1270, left: 1270 } } }, children }],
  });
  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Official minutes (verbale) for signature: approved text plus subscription spaces. */
export async function minutesDocx(m: Meeting, body: string, version: number): Promise<Blob> {
  const num = m.meeting_number ? `${m.meeting_number}/${m.meeting_year}` : "[bozza]";
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`EPOCAR — Verbale del Consiglio Direttivo n. ${num}`)] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({
      text: `Riunione del ${romeDate(m.scheduled_at)} · ${MODE_LABEL[m.mode]} · Versione ${version} del documento`, italics: true })] }),
  ];
  for (const line of body.split("\n")) {
    const text = line.trimEnd();
    if (!text) { children.push(new Paragraph({})); continue; }
    const heading = /^#{1,3}\s+/.test(text);
    children.push(new Paragraph({
      heading: heading ? HeadingLevel.HEADING_2 : undefined,
      spacing: { after: 120 },
      children: [new TextRun({ text: text.replace(/^#{1,3}\s+/, "").replace(/\*\*/g, ""), bold: heading })],
    }));
  }
  children.push(
    new Paragraph({ spacing: { before: 600 }, children: [new TextRun("Il Presidente ______________________________")] }),
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun("Il verbalizzante ______________________________")] }),
  );
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1270, right: 1270, bottom: 1270, left: 1270 } } }, children }],
  });
  return Packer.toBlob(doc);
}
