// Diagnostic SQL runs only on an isolated synthetic PostgreSQL, never a connected database.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('duplicate-account read-only diagnostics', () => {
  it('identifies A/B, follows all member links, excludes secrets and works without optional migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-readonly-'));
    chmodSync(dir, 0o777);
    const run = (args: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${args[0]}`), ...args.slice(1)], { encoding: 'utf8', stdio: 'pipe' });
    const sql = (q: string) => execFileSync('psql', ['-h', dir, '-p', '55443', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', q], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const install = (f: string) => execFileSync('psql', ['-h', dir, '-p', '55443', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve(f)], { stdio: 'pipe' });
    const a = '00000000-0000-4000-8000-0000000000a1';
    const b = '00000000-0000-4000-8000-0000000000b2';
    const tm = '20000000-0000-4000-8000-0000000000b2';
    let started = false;
    try {
      run(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      run(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -p 55443 -h ''`, '-w', 'start']);
      started = true;
      install('src/test/fixtures/account-sync.sql');
      install('setup/treasury-bootstrap-v11.sql');
      install('setup/membership-sync-v14.sql');
      sql(`ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN last_sign_in_at timestamptz, ADD COLUMN encrypted_password text;
        ALTER TABLE profiles ADD COLUMN avatar_url text;
        ALTER TABLE event_registrations ADD COLUMN id uuid, ADD COLUMN event_id uuid;
        CREATE TABLE public.articles(id uuid,title text,published boolean,uploaded_by uuid,image_url text,content text);
        CREATE TABLE public.events(id uuid,title text,published boolean,uploaded_by uuid,image_url text,description text);
        CREATE TABLE public.gallery_images(id uuid,alt_text text,uploaded_by uuid,image_url text);
        CREATE SCHEMA storage;
        CREATE TABLE storage.buckets(id text,public boolean);
        CREATE TABLE storage.objects(id uuid,bucket_id text,name text,owner_id text,created_at timestamptz,updated_at timestamptz);
        INSERT INTO auth.users(id,email,encrypted_password) VALUES ('${a}','a@example.invalid','secret-auth-marker'),('${b}','b@example.invalid','secret-auth-marker');
        INSERT INTO profiles(user_id,first_name,avatar_url) VALUES ('${a}','A','${a}/profile.png'),('${b}','B',null);
        INSERT INTO treasury_bootstrap_links(external_member_id,treasury_member_id) VALUES ('${b}','${tm}');
        INSERT INTO member_public_status(treasury_member_id,user_id,membership_status,category,treasury_updated_at,last_revision) VALUES ('${tm}','${b}','active','Fondatore',now(),7);
        INSERT INTO member_annual_fees(treasury_member_id,membership_year,fee_amount) VALUES ('${tm}',2026,100.00);
        INSERT INTO treasury_member_events(event_id,treasury_member_id,revision,payload_hash,result) VALUES ('evt-test-7','${tm}',7,'secret-payload-marker','applied');
        INSERT INTO treasury_sync_requests(idempotency_key,action,treasury_member_id,payload_hash,response) VALUES ('test-key-7','member_update','${tm}','secret-payload-marker','{"private":"secret-response-marker"}');
        INSERT INTO articles VALUES ('${a}','Article A',true,'${a}','https://example.invalid/storage/v1/object/public/event-images/pic.png?token=secret-url-marker','');
        INSERT INTO storage.buckets VALUES ('event-images',true);
        INSERT INTO storage.objects VALUES ('${a}','event-images','pic.png','${a}',now(),now());`);
      const source = readFileSync(resolve('setup/duplicate-account-readonly.sql'), 'utf8')
        .split('EMAIL_ACCOUNT_A').join('a@example.invalid').split('EMAIL_ACCOUNT_B').join('b@example.invalid')
        .split('UUID_AUTH_A').join(a).split('UUID_AUTH_B').join(b)
        .split('BUCKET_DA_VERIFICARE').join('event-images').split('PERCORSO_OGGETTO').join('pic.png');
      const statements = source.replace(/--[^\n]*/g, '').split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
      const read = (q: string) => sql(`BEGIN TRANSACTION READ ONLY; ${q}; ROLLBACK;`).split('\n').filter(s => s !== 'BEGIN' && s !== 'ROLLBACK').join('\n');
      const output = statements.map(read);
      expect(output[0]).toContain(a);
      expect(output[0]).toContain(b);
      const generated = output[5];
      expect(generated.startsWith('WITH params')).toBe(true);
      const result = read(generated.replace(/;\s*$/, ''));
      expect(result).toContain('Article A');
      expect(result).toContain('"last_revision": 7');
      expect(result).toContain('member_annual_fees');
      expect(result).toContain('100.00');
      expect(result).not.toMatch(/secret-(auth|payload|response|url)-marker/);
      expect(output[6]).toContain('pic.png');
      expect(sql('SELECT count(*) FROM auth.users;')).toBe('2');
      // Older external installations: absent optional tables must not cause a parse failure.
      sql('DROP TABLE member_annual_fees; DROP TABLE treasury_member_events; DROP TABLE treasury_bootstrap_links;');
      const legacy = read(statements[5]);
      expect(read(legacy.replace(/;\s*$/, ''))).toContain('Article A');
    } finally {
      if (started) run(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});