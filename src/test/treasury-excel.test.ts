import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "fs";
import JSZip from "jszip";
import { buildWorkbook, extractFormulas, compareFormulas, writeCell } from "@/lib/treasury-excel";

const bytes = readFileSync("public/templates/EPOCAR_Tesoreria_Rendiconto_template.xlsx");
beforeAll(() => { vi.stubGlobal("fetch", async () => new Response(bytes)); });

describe("treasury excel export", () => {
  it("fills input cells and keeps every formula identical", async () => {
    const blob = await buildWorkbook({
      Movimenti: { A2: new Date("2026-03-01T00:00:00Z"), B2: 1, C2: "Entrata", D2: "A.E.1", G2: "Quota <test> & co", H2: "Rossi Mario", J2: "Bonifico", K2: "Banca", L2: 50 },
      "Quote Soci": { A2: "1", B2: "Rossi Mario", C2: "Ordinario" },
      "Budget Previsionale": { C6: 500 },
    });
    const tpl = await extractFormulas(await JSZip.loadAsync(bytes));
    const out = await JSZip.loadAsync(await new Response(blob).arrayBuffer());
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
});
