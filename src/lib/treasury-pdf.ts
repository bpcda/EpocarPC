import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CODES, euro, summary, type TreasuryData } from "./treasury";

// Board-ready annual report. Independent from the accountant's Excel template (never touched).
export function buildReportPdf(data: TreasuryData, year: number): jsPDF {
  const s = summary(data, year);
  const status = data.years.find((y) => y.year === year)?.status === "closed" ? "Esercizio chiuso" : "Esercizio aperto (dati provvisori)";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const burgundy: [number, number, number] = [92, 18, 28];
  const head = { fillColor: burgundy, textColor: 255, fontStyle: "bold" as const };
  const money = { halign: "right" as const };
  const e = (n: number) => euro(n).replace(/\u00a0/g, " ");

  doc.setFillColor(...burgundy); doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(`EPOCAR - RENDICONTO ${year}`, 14, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Documento per il Consiglio Direttivo - ${status} - generato il ${new Date().toLocaleDateString("it-IT")}`, 14, 22);
  doc.setTextColor(20);

  autoTable(doc, {
    startY: 36, head: [["Riepilogo", "Consuntivo", "Previsto", "Scostamento"]], headStyles: head,
    columnStyles: { 1: money, 2: money, 3: money },
    body: [
      ["Entrate", e(s.inc), e(s.plannedIn), e(s.inc - s.plannedIn)],
      ["Uscite", e(s.out), e(s.plannedOut), e(s.out - s.plannedOut)],
      ["Risultato d'esercizio", e(s.result), e(s.plannedResult), e(s.gap)],
    ],
  });
  autoTable(doc, {
    head: [["Saldi e quote", "Importo"]], headStyles: head, columnStyles: { 1: money },
    body: [
      ["Saldo Banca", e(s.bank)], ["Saldo Cassa", e(s.cash)], ["Saldo complessivo", e(s.result)],
      ["Quote dovute", e(s.duesTotal)], ["Quote incassate", e(s.duesPaid)], ["Quote da incassare", e(s.duesOpen)],
      ["Movimenti registrati", String(s.count)], ["Movimenti senza giustificativo", String(s.missingDocs)],
    ],
  });

  const actual = (code: string) => data.transactions.filter((t) => t.excel_code === code).reduce((a, t) => a + t.amount, 0);
  const planned = (code: string) => data.budgets.find((b) => b.excel_code === code)?.planned_amount ?? 0;
  for (const type of ["Entrata", "Uscita"] as const) {
    const rows = CODES.filter((c) => c.type === type).map((c) => ({ c, p: planned(c.code), a: actual(c.code) })).filter((r) => r.p || r.a);
    autoTable(doc, {
      head: [[type === "Entrata" ? "Entrate per voce" : "Uscite per voce", "Previsto", "Consuntivo", "Diff."]], headStyles: head,
      columnStyles: { 0: { cellWidth: 100 }, 1: money, 2: money, 3: money }, styles: { fontSize: 8 },
      body: rows.length ? rows.map((r) => [`${r.c.code} ${r.c.label}`, e(r.p), e(r.a), e(r.a - r.p)]) : [["Nessuna voce", "", "", ""]],
    });
  }

  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  const sy = y > 260 ? (doc.addPage(), 30) : y;
  doc.setFontSize(9); doc.line(14, sy, 84, sy); doc.line(W - 84, sy, W - 14, sy);
  doc.text("Il Tesoriere", 14, sy + 5); doc.text("Il Presidente", W - 84, sy + 5);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Pagina ${i} di ${pages}`, W - 14, 290, { align: "right" }); }
  return doc;
}

export function exportReportPdf(data: TreasuryData, year: number) {
  const name = `EPOCAR_Rendiconto_${year}_Consiglio_Direttivo.pdf`;
  buildReportPdf(data, year).save(name);
  return name;
}
