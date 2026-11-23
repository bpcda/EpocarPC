import { describe, expect, it } from "vitest";
import { shootingEmail } from "../../setup/functions/shooting-receipt/templates";
describe("email Natale su Ruote", () => {
  for (const kind of ["receipt","confirmed","moved","cancelled","rain"] as const) {
    it(kind, () => {
      const msg = shootingEmail(kind,"test-id","2026-12-03","18:45 · <Piazza>","18:30");
      expect(msg.htmlContent).toContain("&lt;Piazza&gt;");
      expect(msg.htmlContent).not.toContain("<Piazza>");
      expect(msg.textContent).toContain("18:45 · <Piazza>");
      expect(msg.subject).toContain("Natale su Ruote");
    });
  }
});
