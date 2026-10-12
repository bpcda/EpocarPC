import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

describe("public site does not expose the treasury", () => {
  const files = walk("src").filter((f) => /\.(tsx?|html)$/.test(f) && !/[\\/](treasury|test)[\\/]/.test(f) && !/lib[\\/]treasury/.test(f));
  it("has no /tesoreria route or link outside the treasury module", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/["'`]\/tesoreria/);
  });
  it("router does not import treasury pages", () => {
    expect(readFileSync("src/App.tsx", "utf8")).not.toMatch(/treasury/i);
  });
});
