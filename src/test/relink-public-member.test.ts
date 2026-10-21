import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Never connects to production: own Unix socket, synthetic data, disposable cluster.
describe('scoped public member relink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epocar-relink-'));
  const a = '3abfb9da-4153-44e2-a84c-c38fe7a45415';
  const b = '9dbcf104-3ebe-4b4f-9023-8c6061689a60';
  const mid = '1601d3a0-8d64-46be-a7b4-c1d2aaee2552';
  const tm = '3af0240f-e43a-440b-a080-7b50af3939e6';
  const operator = '00000000-0000-4000-8000-000000000099';
  const source = readFileSync('setup/relink-public-member-a.sql', 'utf8');
  const run = (args: string[]) => execFileSync('runuser', ['-u','nobody','--',realpathSync(`/usr/bin/${args[0]}`),...args.slice(1)], {encoding:'utf8',stdio:'pipe'});
  const sql = (q: string) => execFileSync('psql', ['-h',dir,'-p','55444','-U','nobody','-d','postgres','-v','ON_ERROR_STOP=1','-At'], {input:q,encoding:'utf8',stdio:'pipe'}).trim();
  const fn = (file: string, name: string) => {
    const text = readFileSync(file,'utf8');
    const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const end = text.indexOf('END $$;',start);
    if(start<0 || end<0) throw new Error(`Missing actual migration function ${name}`);
    return text.slice(start,end+7);
  };
  const execute = (commit = false) => {
    const match = source.match(/WITH definitions AS \([\s\S]*?AS reviewed_code_fingerprint FROM definitions;/);
    if (!match) throw new Error('Fingerprint query missing');
    const fingerprint = sql(match[0]);
    return sql(source.slice(source.indexOf('BEGIN;'))
      .replace('INCOLLARE_IMPRONTA_CODICE_REVISIONATO',fingerprint)
      .replace('INSERIRE_UUID_AUTH_OPERATORE_ADMIN',operator)
      // Only adapt the operator allowlist for this disposable cluster's owner.
      .replace("('postgres','supabase_admin')","('nobody')")
      .replace('ROLLBACK; -- DEFAULT SICURO',`${commit ? 'COMMIT' : 'ROLLBACK'}; -- DEFAULT SICURO`));
  };
  beforeAll(() => {
    chmodSync(dir,0o777);
    run(['initdb','-D',join(dir,'data'),'-A','trust','--no-locale']);
    run(['pg_ctl','-D',join(dir,'data'),'-l',join(dir,'server.log'),'-o',`-k ${dir} -p 55444 -h ''`,'-w','start']);
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  });
  afterAll(() => { run(['pg_ctl','-D',join(dir,'data'),'-m','immediate','-w','stop']); rmSync(dir,{recursive:true,force:true}); });
  beforeEach(() => {
    sql(`DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
      CREATE TYPE public.app_role AS ENUM('admin','founder','ordinary','supporter','staff');
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE public.user_roles(id uuid DEFAULT gen_random_uuid(), user_id uuid,role app_role,UNIQUE(user_id,role));
      CREATE TABLE public.association_members(id uuid PRIMARY KEY,user_id uuid UNIQUE,email text,category text,card_number int,active bool,admission_date date,resolution_ref text,resolution_date date,updated_at timestamptz DEFAULT now());
      ALTER TABLE public.association_members ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.treasury_bootstrap_links(external_member_id uuid PRIMARY KEY,treasury_member_id uuid UNIQUE);
      CREATE TABLE public.member_public_status(user_id uuid,treasury_member_id uuid,application_id uuid,membership_status text,category text,card_number int,admission_date date,treasury_updated_at timestamptz);
      CREATE TABLE public.membership_applications(id uuid,user_id uuid,status text,member_id uuid,treasury_member_id uuid);
      CREATE TABLE public.association_member_events(id uuid DEFAULT gen_random_uuid(),member_id uuid,event_type text);
      CREATE TABLE public.treasury_audit_log(table_name text,record_id uuid,operation text,changed_by uuid,old_data jsonb,new_data jsonb);
      CREATE FUNCTION public.member_category_role(text) RETURNS text LANGUAGE sql AS $$ SELECT CASE $1 WHEN 'Fondatore' THEN 'founder' WHEN 'Ordinario' THEN 'ordinary' WHEN 'Sostenitore' THEN 'supporter' END $$;
      ${fn('setup/treasury-v4.sql','association_members_link_account')}
      ${fn('setup/treasury-v5.sql','association_members_sync_role')}
      ${fn('setup/treasury-v5.sql','association_members_card_guard')}
      ${fn('setup/treasury.sql','treasury_audit')}
      CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now();RETURN NEW;END $$;
      CREATE FUNCTION public.test_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history trigger must not fire';END $$;
      CREATE TRIGGER association_members_link_account BEFORE INSERT OR UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.association_members_link_account();
      CREATE TRIGGER association_members_sync_role AFTER INSERT OR UPDATE OF user_id,category,active,card_number ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.association_members_sync_role();
      CREATE TRIGGER association_members_card_guard BEFORE INSERT OR UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.association_members_card_guard();
      CREATE TRIGGER association_members_history AFTER UPDATE OF category,active ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.test_history();
      CREATE TRIGGER association_members_updated BEFORE UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
      CREATE TRIGGER association_members_audit AFTER INSERT OR UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.treasury_audit();
      INSERT INTO auth.users VALUES('${a}','a@example.invalid'),('${b}','b@example.invalid'),('${operator}','operator@example.invalid');
      INSERT INTO public.user_roles(user_id,role) VALUES('${operator}','admin'),('${b}','staff');
      SELECT set_config('epocar.card_change','on',false);
      INSERT INTO public.association_members VALUES('${mid}','${b}','b@example.invalid','Fondatore',1,true,'2026-10-07','1','2026-10-07',now());
      INSERT INTO public.treasury_bootstrap_links VALUES('${a}','${tm}');
      INSERT INTO public.association_member_events(member_id,event_type) VALUES('${mid}','approved');`);
  });
  it('defaults to rollback including guard and role changes', () => {
    execute();
    expect(sql(`SELECT user_id FROM association_members WHERE id='${mid}';`)).toBe(b);
    expect(sql("SELECT to_regprocedure('public.epocar_guard_member_1601d3a0()') IS NULL;")).toBe('t');
  });
  it('preserves ID/card/admission/history, assigns founder to A and leaves B roles', () => {
    const roles = sql(`SELECT role FROM user_roles WHERE user_id='${b}' ORDER BY role;`);
    execute(true);
    expect(sql(`SELECT id||'|'||user_id||'|'||card_number||'|'||admission_date||'|'||resolution_ref FROM association_members;`)).toBe(`${mid}|${a}|1|2026-10-07|1`);
    expect(sql(`SELECT role FROM user_roles WHERE user_id='${b}' ORDER BY role;`)).toBe(roles);
    expect(sql(`SELECT role FROM user_roles WHERE user_id='${a}';`)).toBe('founder');
    expect(sql('SELECT count(*) FROM association_member_events;')).toBe('1');
    expect(sql(`SELECT count(*) FROM treasury_audit_log WHERE changed_by='${operator}';`)).toBe('1');
    expect(() => sql(`UPDATE association_members SET user_id='${b}' WHERE id='${mid}';`)).toThrow();
    expect(() => sql(`UPDATE association_members SET user_id=NULL WHERE id='${mid}';`)).toThrow();
    expect(sql(`SELECT user_id FROM association_members;`)).toBe(a);
  });
  it('aborts on a projection still pointing to B', () => {
    sql(`INSERT INTO member_public_status(user_id,treasury_member_id) VALUES('${b}','${tm}');`);
    expect(() => execute(true)).toThrow(/proiezione in conflitto/);
    expect(sql('SELECT user_id FROM association_members;')).toBe(b);
  });
  it('aborts on conflicting historical applicant without changing its identity', () => {
    sql(`INSERT INTO membership_applications(user_id,status,member_id,treasury_member_id) VALUES('${b}','approved','${mid}','${tm}');`);
    expect(() => execute(true)).toThrow(/domanda storica o pendente conflittuale/);
    expect(sql('SELECT user_id FROM membership_applications;')).toBe(b);
  });
  it('aborts when public card/admission does not match instead of overwriting it', () => {
    sql(`UPDATE association_members SET admission_date='2026-10-08';`);
    expect(() => execute(true)).toThrow(/tessera\/ammissione\/delibera pubbliche non coincidenti/);
    expect(sql('SELECT admission_date FROM association_members;')).toBe('2026-10-08');
  });
  it('aborts rather than implicitly removing an alternate category from A', () => {
    sql(`INSERT INTO user_roles(user_id,role) VALUES('${a}','ordinary');`);
    expect(() => execute(true)).toThrow(/A ha categoria diversa/);
    expect(sql(`SELECT role FROM user_roles WHERE user_id='${a}';`)).toBe('ordinary');
  });
});