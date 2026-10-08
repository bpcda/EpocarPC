import { test } from "vitest";
import { writeFileSync } from "fs";
import { buildReportPdf } from "@/lib/treasury-pdf";
test("pdf", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = { years: [{ year: 2026, status: "open" }], transactions: [{ excel_code: "A.E.1", type: "Entrata", amount: 500, account: "Banca", member_id: null, transaction_date: "2026-02-01" }, { excel_code: "A.U.1", type: "Uscita", amount: 120, account: "Cassa", transaction_date: "2026-03-01" }], members: [], budgets: [{ excel_code: "A.E.1", planned_amount: 800 }], events: [], fees: [] };
  writeFileSync("/tmp/r.pdf", Buffer.from(buildReportPdf(d, 2026).output("arraybuffer")));
});
