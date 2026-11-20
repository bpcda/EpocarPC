// @vitest-environment node
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("automatic member card issuance on isolated PostgreSQL", () => {
  it("waits for admission and payment, preserves tokens and rejects every browser role", async () => {
    const container = `epocar-member-cards-${process.pid}`;
    const run = (args: string[], input?: string) => execFileSync("docker", args, { encoding: "utf8", stdio: "pipe", input }).trim();
    const sql = (query: string) => run(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], query);
    const install = () => sql(readFileSync("setup/member-cards-v30.sql", "utf8"));
    const member = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const user = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const fee = (n: number, status: string, delta = 0) => sql(`INSERT INTO member_annual_fees VALUES ('${member(n)}',extract(year FROM timezone('Europe/Rome',now()))::int+${delta},'${status}') ON CONFLICT(treasury_member_id,membership_year) DO UPDATE SET fee_status=EXCLUDED.fee_status;`);
    const add = (n: number, confirmed = true) => sql(`INSERT INTO profiles VALUES ('${user(n)}','Socio','Sintetico ${n}'); INSERT INTO member_public_status VALUES ('${member(n)}','${user(n)}',${n},'Ordinario','active','${confirmed ? "confirmed" : "unverified"}','board_resolution',date_trunc('year',timezone('Europe/Rome',now()))::date,NULL,1);`);
    const count = () => sql("SELECT count(*) FROM member_card_credentials");
    const token = (n: number) => sql(`SELECT qr_token FROM member_card_credentials WHERE treasury_member_id='${member(n)}'`);
    const concurrent = (query: string) => new Promise<number | null>((resolve, reject) => {
      const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", reject); child.on("close", resolve); child.stdin.end(query);
    });
    run(["run", "--rm", "-d", "--network", "none", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          // The image briefly starts a temporary server before exec'ing the final postmaster as PID 1.
          ready = sql("SELECT split_part(pg_read_file('postmaster.pid'),chr(10),1)='1'") === "t";
          if (ready) break;
        } catch { /* Startup is still in progress. */ }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      expect(ready).toBe(true);
      sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE profiles(user_id uuid PRIMARY KEY,first_name text,last_name text);
        CREATE TABLE membership_applications(user_id uuid,full_name text,status text,approved_at timestamptz);
        CREATE TABLE member_public_status(treasury_member_id uuid PRIMARY KEY,user_id uuid,card_number int,category text,membership_status text,admission_status text,admission_source text,admission_date date,admission_decision_date date,last_revision int);
        CREATE TABLE member_annual_fees(treasury_member_id uuid,membership_year int,fee_status text,PRIMARY KEY(treasury_member_id,membership_year));`);
      install(); install();
      add(1, false); fee(1, "paid"); expect(count()).toBe("0");
      sql(`UPDATE member_public_status SET admission_status='confirmed' WHERE treasury_member_id='${member(1)}'`);
      expect(count()).toBe("1");
      const first = token(1);
      expect(first).toMatch(/^v2\.[0-9a-f]{64}$/);
      expect(sql(`SELECT token_hash FROM member_card_credentials WHERE treasury_member_id='${member(1)}'`)).toBe(createHash("sha256").update(first).digest("hex"));

      add(2); fee(2, "partial"); expect(count()).toBe("1"); fee(2, "paid"); expect(count()).toBe("2");
      add(3); fee(3, "exempt"); expect(count()).toBe("3");
      add(4); fee(4, "paid", 1); expect(count()).toBe("3");
      add(5); sql(`UPDATE member_public_status SET membership_status='suspended' WHERE treasury_member_id='${member(5)}'`); fee(5, "paid"); expect(count()).toBe("3");
      add(6); sql(`UPDATE member_public_status SET card_number=NULL WHERE treasury_member_id='${member(6)}'`); fee(6, "paid"); expect(count()).toBe("3");
      for (let i = 0; i < 3; i++) { fee(1, "paid"); sql(`UPDATE member_public_status SET last_revision=last_revision+1 WHERE treasury_member_id='${member(1)}'`); }
      expect(token(1)).toBe(first);
      fee(1, "due"); sql(`UPDATE member_public_status SET membership_status='ceased' WHERE treasury_member_id='${member(1)}'`);
      expect(token(1)).toBe(first);
      sql(`UPDATE member_public_status SET category='Sostenitore' WHERE treasury_member_id='${member(2)}'`);
      expect(sql(`SELECT category FROM member_card_credentials WHERE treasury_member_id='${member(2)}'`)).toBe("Sostenitore");

      for (const role of ["anon", "authenticated"]) {
        expect(() => sql(`SET ROLE ${role}; SELECT * FROM member_card_credentials;`)).toThrow();
        expect(() => sql(`SET ROLE ${role}; SELECT issue_member_card('${member(4)}');`)).toThrow();
        expect(() => sql(`SET ROLE ${role}; UPDATE member_card_credentials SET full_name='forged';`)).toThrow();
      }
      expect(sql("SET ROLE service_role; SELECT count(*) FROM member_card_credentials")).toBe("3");
      expect(sql("SELECT has_table_privilege('service_role','member_card_credentials','UPDATE') OR has_table_privilege('service_role','member_card_credentials','DELETE')")).toBe("f");
      expect(sql("SELECT relrowsecurity FROM pg_class WHERE oid='member_card_credentials'::regclass")).toBe("t");

      const legacy = `v1.${member(2)}.${"a".repeat(86)}`;
      sql(`UPDATE member_card_credentials SET qr_token='${legacy}' WHERE treasury_member_id='${member(2)}'`);
      fee(2, "paid"); expect(token(2)).toBe(legacy);
      expect(() => sql(`UPDATE member_card_credentials SET qr_token='v1.${member(3)}.${"a".repeat(86)}' WHERE treasury_member_id='${member(2)}'`)).toThrow();
      install(); expect(token(2)).toBe(legacy);
      sql(`DELETE FROM member_public_status WHERE treasury_member_id='${member(2)}'`);
      expect(token(2)).toBe(legacy);

      // Two concurrent retries still issue one credential, never two changing codes.
      fee(4, "paid"); sql(`DELETE FROM member_card_credentials WHERE treasury_member_id='${member(4)}'`);
      const outcomes = await Promise.all([concurrent(`SET ROLE service_role; BEGIN; SELECT issue_member_card('${member(4)}');SELECT pg_sleep(0.15);COMMIT;`), concurrent(`SET ROLE service_role; SELECT issue_member_card('${member(4)}');`)]);
      expect(outcomes).toEqual([0, 0]); expect(token(4)).toMatch(/^v2\.[0-9a-f]{64}$/);
      expect(sql(`SELECT count(*) FROM member_card_credentials WHERE treasury_member_id='${member(4)}'`)).toBe("1");

      sql(`CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
        CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
        CREATE TABLE storage.objects(id int,bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
        CREATE POLICY unrelated_permissive_policy ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
        INSERT INTO storage.objects VALUES (1,'member-wallet-passes','private.pkpass'),(2,'unrelated','public.txt');`);
      const wallet = () => sql(readFileSync("setup/member-wallet-v31.sql", "utf8")); wallet(); wallet();
      expect(sql("SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='member-wallet-passes'")).toBe("f|5242880|{application/vnd.apple.pkpass}");
      for (const role of ["anon", "authenticated"]) {
        expect(sql(`SET ROLE ${role}; SELECT name FROM storage.objects`)).toBe("public.txt");
        expect(() => sql(`SET ROLE ${role}; INSERT INTO storage.objects VALUES (3,'member-wallet-passes','bad.pkpass')`)).toThrow();
        expect(sql(`SET ROLE ${role}; UPDATE storage.objects SET name='bad' WHERE bucket_id='member-wallet-passes' RETURNING name`)).toBe("");
        expect(sql(`SET ROLE ${role}; DELETE FROM storage.objects WHERE bucket_id='member-wallet-passes' RETURNING name`)).toBe("");
        expect(() => sql(`SET ROLE ${role}; SELECT apple_wallet_path FROM member_card_credentials`)).toThrow();
      }
      const apple = `${member(4)}/30000000-0000-4000-8000-000000000001.pkpass`;
      sql(`SET ROLE service_role; UPDATE member_card_credentials SET apple_wallet_path='${apple}',google_wallet_url='https://pay.google.com/gp/v/save/abc.def.ghi',wallet_updated_at=now() WHERE treasury_member_id='${member(4)}'`);
      expect(sql(`SELECT apple_wallet_path FROM member_card_credentials WHERE treasury_member_id='${member(4)}'`)).toBe(apple);
      expect(() => sql(`SET ROLE service_role; UPDATE member_card_credentials SET qr_token='v2.${"b".repeat(64)}'`)).toThrow();
      expect(() => sql(`SET ROLE service_role; UPDATE member_card_credentials SET apple_wallet_path='${member(1)}/30000000-0000-4000-8000-000000000001.pkpass' WHERE treasury_member_id='${member(4)}'`)).toThrow();
      expect(() => sql("SET ROLE service_role; UPDATE member_card_credentials SET google_wallet_url='https://foreign.invalid/pass'")).toThrow();
      expect(token(1)).toBe(first);
    } finally { run(["rm", "-f", container]); }
  }, 60000);
});
