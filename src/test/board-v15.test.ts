// Real PostgreSQL, isolated temporary cluster, synthetic data only. Verifies setup/board-v15.sql permissions.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PRES = '00000000-0000-4000-8000-000000000001';
const CONS = '00000000-0000-4000-8000-000000000002';
const FOUNDER = '00000000-0000-4000-8000-000000000003'; // founder without board office
const ADMIN = '00000000-0000-4000-8000-000000000004';

describe('Consiglio Direttivo phase 1 on isolated PostgreSQL', () => {
  it('enforces board access, president-only convocation and state rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-board-'));
    chmodSync(dir, 0o777);
    const asNobody = (a: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${a[0]}`), ...a.slice(1)], { stdio: 'pipe' });
    const psql = (args: string[]) => execFileSync('psql', ['-h', dir, '-p', '55451', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const as = (uid: string, q: string) => psql(['-q', '-Atc', `SET ROLE authenticated; SET app.uid='${uid}'; ${q}`]);
    const fails = (uid: string, q: string) => { try { as(uid, q); return ''; } catch (e) { return String((e as { stderr?: string }).stderr); } };
    let started = false;
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -p 55451 -h ''`, '-w', 'start']);
      started = true;
      psql(['-c', `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
        CREATE TYPE app_role AS ENUM ('admin','founder','president','vice_president','secretary','treasurer','councillor');
        CREATE TABLE profiles(user_id uuid, first_name text, last_name text);
        CREATE TABLE user_roles(user_id uuid, role app_role, UNIQUE(user_id,role));
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
        INSERT INTO profiles VALUES ('${PRES}','Paola','Presidente'),('${CONS}','Carlo','Consigliere'),('${FOUNDER}','Franco','Fondatore');
        INSERT INTO user_roles VALUES ('${PRES}','founder'),('${PRES}','president'),('${CONS}','councillor'),('${FOUNDER}','founder'),('${ADMIN}','admin');`]);
      psql(['-f', resolve('setup/board-v15.sql')]);
      psql(['-f', resolve('setup/board-v15.sql')]); // re-run safety

      const payload = JSON.stringify({ scheduled_at: '2026-11-20T18:00:00+01:00', mode: 'presenza', location: 'Piacenza', minute_taker_id: CONS,
        agenda: [{ kind: 'deliberazione', title: 'Evento di primavera' }], guests: [{ name: 'Ospite esterno' }] });
      const save = `SELECT board_save_meeting(NULL,'${payload}'::jsonb)`;

      expect(fails(CONS, save)).toMatch(/solo il Presidente/);
      expect(fails(FOUNDER, save)).toMatch(/solo il Presidente/);
      expect(fails(FOUNDER, 'SELECT * FROM board_list_members()')).toMatch(/not authorized/);
      const id = as(PRES, save);

      // Draft hidden from councillor; every board member auto-invited with vote, guest without vote, founder excluded.
      expect(as(CONS, 'SELECT count(*) FROM board_meetings')).toBe('0');
      expect(as(PRES, `SELECT string_agg(display_name||':'||can_vote, ',' ORDER BY display_name) FROM board_meeting_participants WHERE meeting_id='${id}'`))
        .toBe('Carlo Consigliere:true,Ospite esterno:false,Paola Presidente:true');
      expect(fails(PRES, `INSERT INTO board_meetings(scheduled_at,created_by) VALUES (now(),'${PRES}')`)).toMatch(/permission denied/);

      as(PRES, `SELECT board_set_status('${id}','CONVOCATO')`);
      expect(as(CONS, 'SELECT meeting_number||\'/\'||meeting_year||\' \'||status FROM board_meetings')).toBe('1/2026 CONVOCATO');
      expect(as(FOUNDER, 'SELECT count(*) FROM board_meetings')).toBe('0');
      expect(as(ADMIN, 'SELECT count(*) FROM board_meetings')).toBe('1');
      expect(fails(ADMIN, `SELECT board_set_status('${id}','ANNULLATO','x')`)).toMatch(/solo il Presidente/);

      as(CONS, `SELECT board_respond('${id}','confirmed')`);
      expect(fails(FOUNDER, `SELECT board_respond('${id}','confirmed')`)).toMatch(/non sei tra i convocati|non accetta/);
      expect(as(PRES, `SELECT response FROM board_meeting_participants WHERE meeting_id='${id}' AND user_id='${CONS}'`)).toBe('confirmed');

      expect(fails(PRES, `SELECT board_set_status('${id}','SOSPESO','')`)).toMatch(/motivazione/);
      expect(fails(PRES, `SELECT board_set_status('${id}','APPROVATO')`)).toMatch(/non consentito/);
      as(PRES, `SELECT board_set_status('${id}','ANNULLATO','Maltempo')`);
      expect(fails(PRES, `SELECT board_save_meeting('${id}','${payload}'::jsonb)`)).toMatch(/non è più modificabile/);
      expect(psql(['-Atc', `SELECT count(*) FROM board_meeting_events WHERE meeting_id='${id}'`])).toBe('4');
      expect(() => psql(['-c', 'DELETE FROM board_meeting_events'])).toThrow();
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
