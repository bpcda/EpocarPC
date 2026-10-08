import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "fs";
import JSZip from "jszip";
import { buildWorkbook, buildWorkbookBytes, extractFormulas, compareFormulas, writeCell } from "@/lib/treasury-excel";
import { buildExportFormulaResults, buildExportWrites, MEMBER_CATEGORIES, type TreasuryData } from "@/lib/treasury";

const bytes = readFileSync("public/templates/EPOCAR_Tesoreria_Rendiconto_template.xlsx");
beforeAll(() => { vi.stubGlobal("fetch", async () => new Response(bytes)); });

describe("treasury excel export", () => {
  it("fills input cells and keeps every formula identical", async () => {
    const blob = await buildWorkbookBytes({
      Movimenti: { A2: new Date("2026-03-01T00:00:00Z"), B2: 1, C2: "Entrata", D2: "A.E.1", G2: "Quota <test> & co", H2: "Rossi Mario", J2: "Bonifico", K2: "Banca", L2: 50 },
      "Quote Soci": { A2: "1", B2: "Rossi Mario", C2: "Ordinario" },
      "Budget Previsionale": { C6: 500 },
    });
    const tpl = await extractFormulas(await JSZip.loadAsync(bytes));
    const out = await JSZip.loadAsync(blob);
    expect(tpl.size).toBeGreaterThan(1000);
    expect(compareFormulas(tpl, await extractFormulas(out))).toEqual([]);
    const xml = await out.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(xml).toContain('<c r="L2" s="4"><v>50</v></c>');
    expect(xml).toContain("Quota &lt;test&gt; &amp; co");
  });
  it("refuses formula cells and non-input columns", async () => {
    await expect(buildWorkbook({ Movimenti: { E2: "x" } })).rejects.toThrow();
    await expect(buildWorkbook({ Dashboard: { B4: 1 } } as never)).rejects.toThrow();
    expect(() => writeCell('<c r="E2" s="3" t="str"><f>X</f><v/></c>', "E2", "a")).toThrow();
  });
  it("exports dashboard fees instead of template amounts without changing formulas or the original", async () => {
    const data: TreasuryData = {
      years: [], transactions: [], members: [], budgets: [], events: [],
      fees: MEMBER_CATEGORIES.map((category, i) => ({ id: String(i), fiscal_year: 2026, category, amount: [120, 65, 300, 0][i], exempt: i === 3, resolution_number: "1", resolution_date: "2026-01-01", document_path: null, document_name: null, notes: null, created_by: "test", created_at: "2026-01-01", superseded_at: null })),
    };
    const writes = await buildExportWrites(data);
    expect(writes.Liste).toEqual({ L2: 120, L3: 65, L4: 300, L5: 0 });
    const original = await JSZip.loadAsync(bytes);
    const out = await JSZip.loadAsync(await buildWorkbookBytes(writes));
    const list = out.file("xl/worksheets/sheet6.xml");
    const originalList = original.file("xl/worksheets/sheet6.xml");
    if (!list || !originalList) throw new Error("Missing Liste");
    const xml = await list.async("string");
    expect(xml).toContain('<c r="L2"><v>120</v></c>');
    expect(xml).toContain('<c r="L3"><v>65</v></c>');
    expect(xml).toContain('<c r="L4"><v>300</v></c>');
    expect(await originalList.async("string")).toContain('<c r="L2"><v>100</v></c>');
    expect(compareFormulas(await extractFormulas(original), await extractFormulas(out))).toEqual([]);
    await expect(buildExportWrites({ ...data, fees: [] })).rejects.toThrow("non deliberata");
  });
  it("refuses every Liste write except valid category amounts", async () => {
    await expect(buildWorkbook({ Liste: { K2: "Other" } })).rejects.toThrow();
    await expect(buildWorkbook({ Liste: { L6: 100 } })).rejects.toThrow();
    await expect(buildWorkbook({ Liste: { L2: -1 } })).rejects.toThrow();
    await expect(buildWorkbook({ Liste: { L2: "100" } })).rejects.toThrow();
  });
  it("stores visible due, paid and residual values without changing the formulas", async () => {
    const data: TreasuryData = {
      years: [], transactions: [], budgets: [], events: [],
      members: [{ id: "00000000-0000-0000-0000-000000000001", user_id: null, full_name: "Brida Lucia", member_number: "9", card_number: 9, category: "Fondatore", admission_date: "2026-10-07", notes: null, active: true, email: null, resolution_ref: null, resolution_date: null, ceased_on: null }],
      fees: [{ id: "fee", fiscal_year: 2026, category: "Fondatore", amount: 20, exempt: false, resolution_number: "1", resolution_date: "2026-01-01", document_path: null, document_name: null, notes: null, created_by: "test", created_at: "2026-01-01", superseded_at: null }],
    };
    const results = buildExportFormulaResults(data);
    expect(results["Quote Soci"]).toMatchObject({ E2: 20, F2: 0, G2: 20, I2: "Da incassare" });
    const out = await JSZip.loadAsync(await buildWorkbookBytes({ "Quote Soci": { A2: "9", B2: "Brida Lucia", C2: "Fondatore" } }, results));
    const xml = await out.file("xl/worksheets/sheet3.xml")!.async("string");
    expect(xml).toContain('<c r="E2" s="4"><f>IF(C2="","",IFERROR(VLOOKUP(C2,Liste!$K$2:$L$5,2,FALSE),0))</f><v>20</v></c>');
    expect(xml).toContain('<c r="I2" s="3" t="str"><f t="shared" ref="I2:I33" si="1">IF(B2="","",IF(G2=0,"Regolare","Da incassare"))</f><v>Da incassare</v></c>');
    expect(compareFormulas(await extractFormulas(await JSZip.loadAsync(bytes)), await extractFormulas(out))).toEqual([]);
  });
});
