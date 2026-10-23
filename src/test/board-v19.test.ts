// Real PostgreSQL, isolated temporary cluster, synthetic data only. Verifies setup/board-v19.sql rules.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PRES = '00000000-0000-4000-8000-000000000001';
const CONS = '00000000-0000-4000-8000-000000000002'; // minute taker
const FOUNDER = '00000000-0000-4000-8000-000000000003'; // founder without board office
const C5 = '00000000-0000-4000-8000-000000000005';

describe('Board phase 5 server rules (minutes draft, review, approval)', () => {
  it('locks the approved minutes, routes corrections through rectified versions and reuses the ballot rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-board-minutes-'));
    chmodSync(dir, 0o777);
    const asNobody = (a: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${a[0]}`), ...a.slice(1)], { stdio: 'pipe' });
    const psql = (args: string[]) => execFileSync('psql', ['-h', dir, '-p', '55455', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const as = (uid: string, q: string) => psql(['-q', '-Atc', `SET ROLE authenticated; SET app.uid='${uid}'; ${q}`]);
    const fails = (uid: string, q: string) => { try { as(uid, q); return ''; } catch (e) { return String((e as { stderr?: string }).stderr); } };
    let started = false;
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -p 55455 -h ''`, '-w', 'start']);
      started = true;
      psql(['-c', `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
        CREATE TYPE app_role AS ENUM ('admin','founder','president','vice_president','secretary','treasurer','councillor');
        CREATE TABLE profiles(user_id uuid, first_name text, last_name text);
        CREATE TABLE user_roles(user_id uuid, role app_role, UNIQUE(user_id,role));
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.role',true),'') $$;
        CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean);
        CREATE TABLE storage.objects(bucket_id text, name text);
        CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
        INSERT INTO profiles VALUES ('${PRES}','Paola','Presidente'),('${CONS}','Carlo','Segretario');
        INSERT INTO user_roles VALUES ('${PRES}','president'),('${CONS}','secretary'),('${FOUNDER}','founder'),('${C5}','councillor');`]);
      for (const f of ['board-v15', 'board-v16', 'board-v17', 'board-v18', 'board-v19']) psql(['-f', resolve(`setup/${f}.sql`)]);
      psql(['-f', resolve('setup/board-v19.sql')]); // re-runnable

      const payload = JSON.stringify({ scheduled_at: '2026-11-20T18:00:00+01:00', mode: 'presenza', location: 'Piacenza', minute_taker_id: CONS,
        agenda: [{ kind: 'discussione', title: 'Attività' }], guests: [] });
      const id = as(PRES, `SELECT board_save_meeting(NULL,'${payload}'::jsonb)`);
      as(PRES, `SELECT board_set_status('${id}','CONVOCATO')`);
      const pid = (u: string) => as(PRES, `SELECT id FROM board_meeting_participants WHERE meeting_id='${id}' AND user_id='${u}'`);
      const attend = (p: string) => `SELECT board_attendance_set('${id}','${p}',true,'presenza',true,'Identita verificata')`;
      as(PRES, attend(pid(PRES))); as(CONS, attend(pid(CONS))); as(PRES, attend(pid(C5)));
      as(PRES, `SELECT board_session_action('${id}','open')`);

      // Only President or minute taker prepares the minutes; one record per meeting.
      expect(fails(C5, `SELECT board_minutes_ensure('${id}')`)).toMatch(/Presidente o il verbalizzante/);
      const mn = as(CONS, `SELECT board_minutes_ensure('${id}')`);
      expect(as(CONS, `SELECT board_minutes_ensure('${id}')`)).toBe(mn); // idempotent
      expect(as(PRES, `SELECT number FROM board_minutes WHERE id='${mn}'`)).toBe('1');

      // Versions: President/minute-taker write; identical text does not create a new version.
      as(CONS, `SELECT board_minutes_save('${id}','# Verbale\nPrima bozza.','manuale')`);
      as(CONS, `SELECT board_minutes_save('${id}','# Verbale\nPrima bozza.','manuale')`);
      expect(as(PRES, `SELECT current_version FROM board_minutes WHERE id='${mn}'`)).toBe('1');
      as(PRES, `SELECT board_minutes_save('${id}','# Verbale\nBozza generata dal modello.','ia')`);
      expect(as(PRES, `SELECT current_version||':'||status FROM board_minutes WHERE id='${mn}'`)).toBe('2:BOZZA');
      expect(as(PRES, `SELECT source FROM board_minute_versions WHERE minutes_id='${mn}' AND version=2`)).toBe('ia');

      // Rectifications: any board member proposes, only President/minute-taker decides.
      as(C5, `SELECT board_minutes_rectify('${mn}','Manca la menzione del punto varie ed eventuali')`);
      expect(fails(C5, `SELECT board_minutes_rectification_decide((SELECT id FROM board_minute_rectifications LIMIT 1),'accolta')`)).toMatch(/Presidente o il verbalizzante/);
      as(CONS, `SELECT board_minutes_rectification_decide((SELECT id FROM board_minute_rectifications LIMIT 1),'accolta')`);

      // Approval vote: president only, quorum required, text locked while voting.
      expect(fails(CONS, `SELECT board_minutes_submit_vote('${mn}')`)).toMatch(/solo il Presidente/);
      const b1 = as(PRES, `SELECT board_minutes_submit_vote('${mn}')`);
      expect(as(PRES, `SELECT status FROM board_minutes WHERE id='${mn}'`)).toBe('IN_APPROVAZIONE');
      expect(as(PRES, `SELECT locked_at IS NOT NULL FROM board_minute_versions WHERE minutes_id='${mn}' AND version=2`)).toBe('t');
      expect(fails(CONS, `SELECT board_minutes_save('${id}','Altro testo','manuale')`)).toMatch(/bloccato/);
      expect(fails(C5, `SELECT board_minutes_rectify('${mn}','Rettifica durante il voto')`)).toMatch(/attendere l.esito/);

      // Vote name by name; rejected minutes return to review.
      as(PRES, `SELECT board_ballot_vote('${b1}','favorevole')`);
      as(CONS, `SELECT board_ballot_vote('${b1}','contrario')`);
      as(C5, `SELECT board_ballot_vote('${b1}','contrario')`);
      as(PRES, `SELECT board_ballot_close('${b1}')`);
      expect(as(PRES, `SELECT result FROM board_ballots WHERE id='${b1}'`)).toBe('respinta');
      expect(as(PRES, `SELECT status FROM board_minutes WHERE id='${mn}'`)).toBe('IN_REVISIONE');

      // New version, new vote, approved: the text is definitively locked.
      as(CONS, `SELECT board_minutes_save('${id}','# Verbale\nTesto rivisto dopo la revisione.','manuale')`);
      const b2 = as(PRES, `SELECT board_minutes_submit_vote('${mn}')`);
      as(PRES, `SELECT board_ballot_vote('${b2}','favorevole')`);
      as(CONS, `SELECT board_ballot_vote('${b2}','favorevole')`);
      as(C5, `SELECT board_ballot_vote('${b2}','astenuto')`);
      as(PRES, `SELECT board_ballot_close('${b2}')`);
      expect(as(PRES, `SELECT status FROM board_minutes WHERE id='${mn}'`)).toBe('APPROVATO');
      expect(fails(PRES, `SELECT board_minutes_save('${id}','Modifica silenziosa','manuale')`)).toMatch(/versione rettificata/);

      // A later correction is an identifiable rectified version that needs a new approval.
      as(CONS, `SELECT board_minutes_save('${id}','# Verbale\nTesto rettificato.','rettifica')`);
      expect(as(PRES, `SELECT status||':'||current_version FROM board_minutes WHERE id='${mn}'`)).toBe('IN_REVISIONE:4');
      expect(as(PRES, `SELECT source FROM board_minute_versions WHERE minutes_id='${mn}' AND version=4`)).toBe('rettifica');

      // Signed copy: only on an approved minutes, path validated.
      expect(fails(PRES, `SELECT board_minutes_signed('${mn}','${id}/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf')`)).toMatch(/verbale approvato/);
      const b3 = as(PRES, `SELECT board_minutes_submit_vote('${mn}')`);
      as(PRES, `SELECT board_ballot_vote('${b3}','favorevole')`); as(CONS, `SELECT board_ballot_vote('${b3}','favorevole')`);
      as(PRES, `SELECT board_ballot_close('${b3}')`);
      expect(fails(PRES, `SELECT board_minutes_signed('${mn}','altro/percorso.pdf')`)).toMatch(/percorso del file non valido/);
      as(PRES, `SELECT board_minutes_signed('${mn}','${id}/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf')`);
      expect(as(PRES, `SELECT signed_at IS NOT NULL FROM board_minutes WHERE id='${mn}'`)).toBe('t');

      // One open ballot per meeting still holds across deliberations and minutes.
      const d1 = as(PRES, `SELECT board_deliberation_save('${id}',NULL,'{"title":"X","body":"Y"}'::jsonb)`);
      const b4 = as(PRES, `SELECT board_ballot_open('${d1}')`);
      expect(fails(PRES, `SELECT board_minutes_submit_vote('${mn}')`)).toMatch(/non è in uno stato|già una votazione in corso/);
      as(PRES, `SELECT board_ballot_cancel('${b4}','Errore')`);

      // Non-board users see nothing; clients cannot write directly.
      expect(as(FOUNDER, `SELECT count(*) FROM board_minutes`)).toBe('0');
      expect(as(FOUNDER, `SELECT count(*) FROM board_minute_versions`)).toBe('0');
      expect(fails(PRES, `UPDATE board_minutes SET status='APPROVATO'`)).toMatch(/permission denied/);
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
