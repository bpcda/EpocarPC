import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";

const available = !spawnSync("initdb", ["--version"]).error && !spawnSync("psql", ["--version"]).error;
describe("Board integration step 1 on isolated PostgreSQL", () => {
  it.skipIf(!available)("closes with approved minutes or a reason, never during a ballot, and preserves the closed act", () => {
    const dir = mkdtempSync(join(tmpdir(), "epocar-board-session-"));
    const root = process.getuid?.() === 0;
    if (root) chmodSync(dir, 0o777);
    const pg = (command: string, args: string[]) => root
      ? execFileSync("runuser", ["-u", "nobody", "--", command, ...args], { stdio: "pipe" })
      : execFileSync(command, args, { stdio: "pipe" });
    const psql = (args: string[]) => execFileSync("psql", ["-h", dir, "-p", "55457", "-U", root ? "nobody" : userInfo().username, "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8", stdio: "pipe" });
    let started = false;
    try {
      pg("initdb", ["-D", join(dir, "data"), "-A", "trust", "--no-locale"]);
      pg("pg_ctl", ["-D", join(dir, "data"), "-l", join(dir, "log"), "-o", `-k ${dir} -p 55457 -h ''`, "-w", "start"]);
      started = true;
      psql(["-f", resolve("src/test/fixtures/board-schema.sql")]);
      for (const version of [15, 16, 17, 18, 19, 20, 21, 21]) psql(["-f", resolve(`setup/board-v${version}.sql`)]);
      expect(() => psql(["-f", resolve("src/test/fixtures/board-session-checks.sql")])).not.toThrow();
    } finally {
      if (started) pg("pg_ctl", ["-D", join(dir, "data"), "-m", "immediate", "stop"]);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
