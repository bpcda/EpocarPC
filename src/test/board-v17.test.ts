// Real PostgreSQL, isolated temporary cluster, synthetic data only. Verifies setup/board-v17.sql rules.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PRES = '00000000-0000-4000-8000-000000000001';
const CONS = '00000000-0000-4000-8000-000000000002'; // designated minute taker, secretary
const FOUNDER = '00000000-0000-4000-8000-000000000003'; // founder without board office
const ADMIN = '00000000-0000-4000-8000-000000000004';
const C5 = '00000000-0000-4000-8000-000000000005';
const C6 = '00000000-0000-4000-8000-000000000006';

const d = (o: Record<string, unknown>) => `'${JSON.stringify(o)}'::jsonb`;

describe('Board phase 3 server rules', () => {
  it('keeps draft authorship, locks the voted text and records every vote by name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-board-vote-'));
    chmodSync(dir, 0o777);
    const asNobody = (a: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${a[0]}`), ...a.slice(1)], { stdio: 'pipe' });
    const psql = (args: string[]) => execFileSync('psql', ['-h', dir, '-p', '55453', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const as = (uid: string, q: string) => psql(['-q', '-Atc', `SET ROLE authenticated; SET app.uid='${uid}'; ${q}`]);
    const fails = (uid: string, q: string) => { try { as(uid, q); return ''; } catch (e) { return String((e as { stderr?: string }).stderr); } };
    let started = false;
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -p 55453 -h ''`, '-w', 'start']);
      started = true;
      psql(['-c', `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
        CREATE TYPE app_role AS ENUM ('admin','founder','president','vice_president','secretary','treasurer','councillor');
        CREATE TABLE profiles(user_id uuid, first_name text, last_name text);
        CREATE TABLE user_roles(user_id uuid, role app_role, UNIQUE(user_id,role));
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
        INSERT INTO profiles VALUES ('${PRES}','Paola','Presidente'),('${CONS}','Carlo','Segretario');
        INSERT INTO user_roles VALUES ('${PRES}','president'),('${PRES}','founder'),('${CONS}','secretary'),('${FOUNDER}','founder'),('${ADMIN}','admin'),
          ('${C5}','councillor'),('${C6}','councillor'),('00000000-0000-4000-8000-000000000007','councillor');`]);
      psql(['-f', resolve('setup/board-v15.sql')]);
      psql(['-f', resolve('setup/board-v16.sql')]);
      psql(['-f', resolve('setup/board-v17.sql')]);
      psql(['-f', resolve('setup/board-v17.sql')]);
      const payload = JSON.stringify({ scheduled_at: '2026-11-20T18:00:00+01:00', mode: 'ibrido', location: 'Piacenza', video_link: 'https://example.org/meeting', minute_taker_id: CONS,
        agenda: [{ kind: 'deliberazione', title: 'Bilancio' }, { kind: 'discussione', title: 'Attività' }], guests: [{ name: 'Ospite' }] });
      const id = as(PRES, `SELECT board_save_meeting(NULL,'${payload}'::jsonb)`);
      as(PRES, `SELECT board_set_status('${id}','CONVOCATO')`);
      const pid = (u: string) => as(PRES, `SELECT id FROM board_meeting_participants WHERE meeting_id='${id}' AND user_id='${u}'`);
      const attend = (p: string, present = true) => `SELECT board_attendance_set('${id}','${p}',${present},'remoto',true,'Identita e comunicazione verificate')`;
      as(PRES, attend(pid(PRES))); as(CONS, attend(pid(CONS))); as(PRES, attend(pid(C5)));
      as(PRES, `SELECT board_session_action('${id}','open')`);

      // Only the President or the designated minute taker writes the official text.
      expect(fails(C5, `SELECT board_deliberation_save('${id}',NULL,${d({ title: 'X', body: 'Y' })})`)).toMatch(/Presidente o il verbalizzante/);
      const d1 = as(PRES, `SELECT board_deliberation_save('${id}',NULL,${d({ title: 'Bilancio 2026', body: 'Approvare il bilancio.', documents: [{ name: 'Conto consuntivo' }] })})`);
      expect(as(PRES, `SELECT number||':'||status||':'||current_version FROM board_deliberations WHERE id='${d1}'`)).toBe('1:BOZZA:1');
      as(CONS, `SELECT board_deliberation_save('${id}','${d1}',${d({ title: 'Bilancio 2026', body: 'Approvare il bilancio rivisto.' })})`);
      expect(as(PRES, `SELECT current_version FROM board_deliberations WHERE id='${d1}'`)).toBe('2');

      // A councillor may suggest a change; the official text is untouched.
      as(C5, `SELECT board_deliberation_suggest('${d1}','Aggiungere il dettaglio delle spese')`);
      expect(as(PRES, `SELECT body FROM board_deliberation_versions WHERE deliberation_id='${d1}' AND version=2`)).toBe('Approvare il bilancio rivisto.');
      expect(as(PRES, `SELECT count(*) FROM board_deliberation_suggestions WHERE deliberation_id='${d1}'`)).toBe('1');
      const sug = as(PRES, `SELECT id FROM board_deliberation_suggestions WHERE deliberation_id='${d1}'`);
      expect(fails(C5, `SELECT board_deliberation_suggestion_decide('${sug}','accolta')`)).toMatch(/Presidente o il verbalizzante/);
      as(CONS, `SELECT board_deliberation_suggestion_decide('${sug}','accolta')`);
      expect(as(PRES, `SELECT status FROM board_deliberation_suggestions WHERE id='${sug}'`)).toBe('accolta');

      // Voting is authorized by the President alone and only with quorum.
      expect(fails(CONS, `SELECT board_ballot_open('${d1}')`)).toMatch(/solo il Presidente/);
      const b1 = as(PRES, `SELECT board_ballot_open('${d1}')`);
      expect(as(PRES, `SELECT status FROM board_deliberations WHERE id='${d1}'`)).toBe('IN_VOTAZIONE');
      expect(as(PRES, `SELECT locked_at IS NOT NULL FROM board_deliberation_versions WHERE deliberation_id='${d1}' AND version=2`)).toBe('t');
      expect(fails(PRES, `SELECT board_deliberation_save('${id}','${d1}',${d({ title: 'Bilancio 2026', body: 'Testo alterato' })})`)).toMatch(/in votazione/);

      // Votes: name by name, only for identified voting members, one per person.
      expect(fails(FOUNDER, `SELECT board_ballot_vote('${b1}','favorevole')`)).toMatch(/not authorized/);
      expect(fails(C6, `SELECT board_ballot_vote('${b1}','favorevole')`)).toMatch(/presenza non è stata verificata/);
      as(PRES, `SELECT board_ballot_vote('${b1}','favorevole')`);
      as(CONS, `SELECT board_ballot_vote('${b1}','favorevole')`);
      as(C5, `SELECT board_ballot_vote('${b1}','astenuto')`);
      expect(fails(C5, `SELECT board_ballot_vote('${b1}','astenuto')`)).toMatch(/già espresso questo voto/);
      as(C5, `SELECT board_ballot_vote('${b1}','contrario')`); // own vote may change until the count
      expect(fails(CONS, `SELECT board_ballot_close('${b1}')`)).toMatch(/solo il Presidente/);
      as(PRES, `SELECT board_ballot_close('${b1}')`);
      expect(as(PRES, `SELECT status FROM board_deliberations WHERE id='${d1}'`)).toBe('APPROVATA');
      expect(as(PRES, `SELECT result||':'||tie_break FROM board_ballots WHERE id='${b1}'`)).toBe('approvata:false');
      expect(as(PRES, `SELECT status FROM board_deliberation_documents WHERE deliberation_id='${d1}'`)).toBe('approvato');
      expect(fails(PRES, `SELECT board_deliberation_save('${id}','${d1}',${d({ title: 'Bilancio 2026', body: 'Ancora' })})`)).toMatch(/non è più modificabile/);

      // Tie: the President's casting vote applies only then.
      const d2 = as(CONS, `SELECT board_deliberation_save('${id}',NULL,${d({ title: 'Escursione', body: 'Approvare la gita sociale.' })})`);
      const b2 = as(PRES, `SELECT board_ballot_open('${d2}')`);
      as(CONS, `SELECT board_ballot_vote('${b2}','contrario')`); as(C5, `SELECT board_ballot_vote('${b2}','astenuto')`);
      as(PRES, `SELECT board_ballot_vote('${b2}','favorevole')`);
      as(PRES, `SELECT board_ballot_close('${b2}')`);
      expect(as(PRES, `SELECT result||':'||tie_break FROM board_ballots WHERE id='${b2}'`)).toBe('approvata:true');

      // Tie without a presidential vote is rejected.
      const d3 = as(CONS, `SELECT board_deliberation_save('${id}',NULL,${d({ title: 'Sede', body: 'Cambiare la sede.' })})`);
      const b3 = as(PRES, `SELECT board_ballot_open('${d3}')`);
      as(C5, `SELECT board_ballot_vote('${b3}','favorevole')`); as(CONS, `SELECT board_ballot_vote('${b3}','contrario')`);
      as(PRES, `SELECT board_ballot_close('${b3}')`);
      expect(as(PRES, `SELECT result||':'||tie_break FROM board_ballots WHERE id='${b3}'`)).toBe('respinta:false');

      // One vote at a time; a vote opened in error can be cancelled with a reason.
      const d4 = as(CONS, `SELECT board_deliberation_save('${id}',NULL,${d({ title: 'Assicurazione', body: 'Rinnovare la polizza.' })})`);
      const b4 = as(PRES, `SELECT board_ballot_open('${d4}')`);
      expect(fails(PRES, `SELECT board_ballot_open('${d4}')`)).toMatch(/già una votazione in corso/);
      expect(fails(PRES, `SELECT board_ballot_cancel('${b4}','')`)).toMatch(/motivazione obbligatoria/);
      as(PRES, `SELECT board_ballot_cancel('${b4}','Errore di procedura')`);
      expect(as(PRES, `SELECT status FROM board_deliberations WHERE id='${d4}'`)).toBe('BOZZA');

      // Quorum re-checked at the count: a lost quorum voids the decision, the text can be revised.
      const b5 = as(PRES, `SELECT board_ballot_open('${d4}')`);
      as(PRES, `SELECT board_ballot_vote('${b5}','favorevole')`);
      as(PRES, attend(pid(CONS), false)); as(PRES, attend(pid(C5), false));
      as(PRES, `SELECT board_ballot_close('${b5}')`);
      expect(as(PRES, `SELECT result FROM board_ballots WHERE id='${b5}'`)).toBe('senza_quorum');
      expect(as(PRES, `SELECT status FROM board_deliberations WHERE id='${d4}'`)).toBe('SENZA_QUORUM');
      as(PRES, `SELECT board_deliberation_save('${id}','${d4}',${d({ title: 'Assicurazione', body: 'Rinnovare la polizza con massimale maggiorato.' })})`);
      expect(as(PRES, `SELECT status||':'||current_version FROM board_deliberations WHERE id='${d4}'`)).toBe('BOZZA:2');

      // The register cannot be rewritten by clients.
      expect(() => psql(['-c', 'DELETE FROM board_meeting_events'])).toThrow();
      expect(fails(PRES, `UPDATE board_votes SET vote='favorevole'`)).toMatch(/permission denied/);
      expect(as(PRES, `SELECT count(*) FROM board_votes WHERE ballot_id='${b1}'`)).toBe('3');
      expect(psql(['-q', '-Atc', `SET ROLE authenticated; SET app.uid='${FOUNDER}'; SELECT count(*) FROM board_deliberations`])).toBe('0');
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
