// Real PostgreSQL, isolated temporary cluster with ONLY synthetic fixtures.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('account/sync SQL on isolated synthetic PostgreSQL', () => {
  it('validates installation, refusals, rejected history, retries and bootstrap pages beyond 100', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-synthetic-'));
    chmodSync(dir, 0o777);
    const asNobody = (args: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', ...args], { encoding: 'utf8', stdio: 'pipe' });
    const sql = (query: string) => execFileSync('psql', ['-h', dir, '-p', '55439', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const install = (file: string) => execFileSync('psql', ['-h', dir, '-p', '55439', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve(file)], { stdio: 'pipe' });
    let started = false;
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -p 55439 -h ''`, '-w', 'start']);
      started = true;
      install('src/test/fixtures/account-sync.sql');
      install('setup/account-deletion-v12.sql');
      install('setup/account-deletion-v12.sql'); // re-run safety
      install('setup/treasury-bootstrap-v11.sql');
      install('setup/treasury-bootstrap-v13.sql');
      const admin = '00000000-0000-4000-8000-000000000001';
      const target = '00000000-0000-4000-8000-000000000002';
      sql(`INSERT INTO auth.users(id,email) VALUES ('${admin}','admin@example.invalid'),('${target}','rejected@example.invalid'); INSERT INTO user_roles VALUES ('${admin}','admin'); INSERT INTO profiles(user_id) VALUES ('${target}'); INSERT INTO membership_applications(user_id,status) VALUES ('${target}','rejected');`);
      expect(JSON.parse(sql(`SELECT account_deletion_status('${target}');`))).toMatchObject({ exists: true, application_status: 'rejected', is_member: false, last_admin: false });
      expect(sql(`SELECT has_function_privilege('authenticated','public.account_deletion_status(uuid)','EXECUTE');`)).toBe('f');
      expect(() => sql(`SELECT account_deletion_prepare('${target}','${admin}','admin');`)).toThrow();
      expect(() => sql(`SELECT account_deletion_prepare('${admin}','${admin}','self');`)).toThrow();
      expect(sql(`SELECT count(*) FROM profiles WHERE user_id='${target}';`)).toBe('1');
      sql(`REVOKE EXECUTE ON FUNCTION account_deletion_finalize(uuid,uuid,text,text) FROM service_role;`);
      expect(() => sql(`SELECT account_deletion_prepare('${target}','${target}','self');`)).toThrow();
      expect(sql(`SELECT count(*) FROM profiles WHERE user_id='${target}';`)).toBe('1');
      sql(`GRANT EXECUTE ON FUNCTION account_deletion_finalize(uuid,uuid,text,text) TO service_role;`);
      expect(JSON.parse(sql(`SELECT account_deletion_prepare('${target}','${target}','self');`))).toMatchObject({ outcome: 'prepared', application_outcome: 'kept' });
      expect(sql(`SELECT status FROM membership_applications WHERE user_id='${target}';`)).toBe('rejected');
      // Partial preparation: synthetic auth user still exists; retry keeps one audit evidence.
      sql(`SELECT account_deletion_prepare('${admin}','${target}','admin');`);
      expect(sql(`SELECT count(*) FROM account_deletion_log WHERE target_user='${target}' AND outcome='prepared';`)).toBe('1');
      expect(sql(`SELECT count(*) FROM auth.users WHERE id='${target}';`)).toBe('1');
      // Only synthetic identity is removed, never the connected project's Auth.
      sql(`DELETE FROM auth.users WHERE id='${target}'; SELECT account_deletion_finalize('${admin}','${target}','admin','deleted');`);
      expect(sql(`SELECT status FROM membership_applications WHERE user_id='${target}';`)).toBe('rejected');
      sql(`INSERT INTO auth.users(id,email) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'candidate'||n||'@example.invalid' FROM generate_series(1,105) n; INSERT INTO user_roles SELECT id,'founder'::app_role FROM auth.users WHERE email LIKE 'candidate%';`);
      expect(sql(`SELECT count(*) FROM treasury_sync_bootstrap_members(100000,NULL);`)).toBe('100');
      const cursor = sql(`SELECT max(external_member_id::text) FROM treasury_sync_bootstrap_members(100,NULL);`);
      expect(sql(`SELECT count(*) FROM treasury_sync_bootstrap_members(100,'${cursor}');`)).toBe('5');
      const late = '10000000-0000-4000-8000-000000000105';
      expect(JSON.parse(sql(`SELECT treasury_sync_bootstrap_ack('synthetic-105','test','{"external_member_id":"${late}","treasury_member_id":"20000000-0000-4000-8000-000000000105"}');`))).toMatchObject({ result: 'applied' });
      // Role does not override a rejection; no automatic admission/projection.
      sql(`INSERT INTO membership_applications(user_id,status) VALUES ('${late}','rejected');`);
      expect(sql(`SELECT count(*) FROM treasury_sync_bootstrap_members(100,'${cursor}') WHERE external_member_id='${late}';`)).toBe('0');
      expect(() => sql(`SELECT treasury_sync_bootstrap_ack('synthetic-rejected','test','{"external_member_id":"${late}","treasury_member_id":"20000000-0000-4000-8000-000000000105"}');`)).toThrow();
      expect(sql(`SELECT count(*) FROM member_public_status;`)).toBe('0');
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
