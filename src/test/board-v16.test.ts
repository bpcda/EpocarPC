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

describe('Board phase 2 server rules', () => {
  it('verifies identified attendance, current-office quorum, permissions and live lifecycle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-board-live-'));
    chmodSync(dir, 0o777);
    const asNobody = (a: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${a[0]}`), ...a.slice(1)], { stdio: 'pipe' });
    const psql = (args: string[]) => execFileSync('psql', ['-h', dir, '-p', '55452', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const as = (uid: string, q: string) => psql(['-q', '-Atc', `SET ROLE authenticated; SET app.uid='${uid}'; ${q}`]);
    const fails = (uid: string, q: string) => { try { as(uid, q); return ''; } catch (e) { return String((e as { stderr?: string }).stderr); } };
    let started = false;
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -p 55452 -h ''`, '-w', 'start']);
      started = true;
      psql(['-c', `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
        CREATE TYPE app_role AS ENUM ('admin','founder','president','vice_president','secretary','treasurer','councillor');
        CREATE TABLE profiles(user_id uuid, first_name text, last_name text);
        CREATE TABLE user_roles(user_id uuid, role app_role, UNIQUE(user_id,role));
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
        INSERT INTO profiles VALUES ('${PRES}','Paola','Presidente'),('${CONS}','Carlo','Consigliere');
        INSERT INTO user_roles VALUES ('${PRES}','president'),('${PRES}','founder'),('${CONS}','secretary'),('${FOUNDER}','founder'),('${ADMIN}','admin'),
          ('00000000-0000-4000-8000-000000000005','councillor'),('00000000-0000-4000-8000-000000000006','councillor'),('00000000-0000-4000-8000-000000000007','councillor');`]);
      psql(['-f', resolve('setup/board-v15.sql')]);
      psql(['-f', resolve('setup/board-v16.sql')]);
      psql(['-f', resolve('setup/board-v16.sql')]);
      const payload = JSON.stringify({ scheduled_at: '2026-11-20T18:00:00+01:00', mode: 'ibrido', location: 'Piacenza', video_link: 'https://example.org/meeting', minute_taker_id: CONS,
        agenda: [{ kind: 'discussione', title: 'Attività' }, { kind: 'comunicazione', title: 'Comunicazioni' }], guests: [{ name: 'Ospite' }] });
      const id = as(PRES, `SELECT board_save_meeting(NULL,'${payload}'::jsonb)`);
      as(PRES, `SELECT board_set_status('${id}','CONVOCATO')`);
      const pid = (u: string) => as(PRES, `SELECT id FROM board_meeting_participants WHERE meeting_id='${id}' AND user_id='${u}'`);
      const quorum = () => JSON.parse(as(PRES, `SELECT board_quorum('${id}')`));
      const attend = (p: string, present = true) => `SELECT board_attendance_set('${id}','${p}',${present},'remoto',true,'Identità e comunicazione verificate')`;
      expect(quorum()).toEqual({ total: 5, present: 0, required: 3, met: false });
      as(CONS, `SELECT board_respond('${id}','confirmed'); SELECT board_heartbeat('${id}'); SELECT board_attendance_request('${id}')`);
      expect(quorum().present).toBe(0); // RSVP/request/heartbeat never count
      expect(fails(ADMIN, `SELECT board_session_action('${id}','open')`)).toMatch(/solo il Presidente/);
      expect(fails(CONS, `SELECT board_session_action('${id}','open')`)).toMatch(/solo il Presidente/);
      expect(fails(FOUNDER, `SELECT board_quorum('${id}')`)).toMatch(/not authorized/);
      expect(fails(ADMIN, attend(pid(CONS)))).toMatch(/Presidente o verbalizzante/);
      expect(fails(PRES, `SELECT board_attendance_set('${id}','${pid(CONS)}',true,'remoto',false,'x')`)).toMatch(/identificazione/);
      expect(fails(PRES, `SELECT board_attendance_set('${id}','${pid(CONS)}',true,'remoto',true,'')`)).toMatch(/nota/);
      as(CONS, attend(pid(CONS))); // designated secretary, not every councillor
      as(PRES, attend(pid(PRES)));
      const third = pid('00000000-0000-4000-8000-000000000005');
      expect(fails('00000000-0000-4000-8000-000000000005', attend(third))).toMatch(/Presidente o verbalizzante/);
      as(PRES, attend(third));
      const guest = as(PRES, `SELECT id FROM board_meeting_participants WHERE meeting_id='${id}' AND kind='guest'`);
      as(PRES, attend(guest));
      expect(quorum()).toEqual({ total: 5, present: 3, required: 3, met: true });
      as(PRES, `SELECT board_session_action('${id}','open')`);
      as(PRES, `SELECT board_session_action('${id}','suspend','Verifica connessione')`);
      expect(fails(PRES, `SELECT board_save_meeting('${id}','${payload}'::jsonb)`)).toMatch(/già iniziata/);
      expect(fails(PRES, `SELECT board_set_status('${id}','CONVOCATO')`)).toMatch(/già iniziata/);
      expect(fails(CONS, `SELECT board_respond('${id}','declined')`)).toMatch(/già iniziata/);
      expect(fails(PRES, `SELECT board_save_meeting_phase1('${id}','${payload}'::jsonb)`)).toMatch(/permission denied/);
      as(PRES, `SELECT board_session_action('${id}','resume')`);
      const agenda = as(PRES, `SELECT id FROM board_agenda_items WHERE meeting_id='${id}' ORDER BY position LIMIT 1`);
      expect(fails(CONS, `SELECT board_agenda_select('${id}','${agenda}')`)).toMatch(/solo il Presidente/);
      expect(fails(PRES, `SELECT board_agenda_select('${id}','${PRES}')`)).toMatch(/estraneo/);
      as(PRES, `SELECT board_agenda_select('${id}','${agenda}')`);
      expect(as(CONS, `SELECT active_agenda_id FROM board_meetings WHERE id='${id}'`)).toBe(agenda);
      // Stale technical connection alone cannot remove attendance.
      psql(['-c', `UPDATE board_meeting_participants SET last_seen_at=now()-interval '1 hour' WHERE meeting_id='${id}'`]);
      expect(quorum().present).toBe(3);
      as(PRES, attend(third, false));
      expect(quorum()).toEqual({ total: 5, present: 2, required: 3, met: false });
      as(CONS, `SELECT board_heartbeat('${id}')`);
      expect(quorum().present).toBe(2);
      // Current-office loss changes denominator/count, retained snapshots do not confer quorum.
      psql(['-c', `DELETE FROM user_roles WHERE user_id='${CONS}'`]);
      expect(quorum()).toEqual({ total: 4, present: 1, required: 3, met: false });
      expect(fails(CONS, attend(pid(PRES)))).toMatch(/Presidente o verbalizzante/);
      as(PRES, `SELECT board_session_action('${id}','close')`);
      expect(as(PRES, `SELECT status||':'||(started_at IS NOT NULL)||':'||(ended_at IS NOT NULL) FROM board_meetings WHERE id='${id}'`)).toBe('VERBALE_IN_REVISIONE:true:true');
      expect(fails(PRES, attend(pid(PRES), false))).toMatch(/non modificabili/);
      expect(fails(PRES, `SELECT board_session_action('${id}','resume')`)).toMatch(/non consentita/);
      expect(() => psql(['-c', 'DELETE FROM board_meeting_events'])).toThrow();
      expect(fails(PRES, `UPDATE board_meeting_participants SET present=true`)).toMatch(/permission denied/);
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
