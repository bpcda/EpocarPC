// Real PostgreSQL, isolated temporary cluster, synthetic data only. Verifies setup/board-v18.sql rules.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PRES = '00000000-0000-4000-8000-000000000001';
const CONS = '00000000-0000-4000-8000-000000000002'; // minute taker
const FOUNDER = '00000000-0000-4000-8000-000000000003'; // founder without board office
const C5 = '00000000-0000-4000-8000-000000000005';

describe('Board phase 4 server rules (audio consent and transcription)', () => {
  it('requires recorded consent, restricts shared tracks and keeps transcripts service-only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-board-audio-'));
    chmodSync(dir, 0o777);
    const asNobody = (a: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${a[0]}`), ...a.slice(1)], { stdio: 'pipe' });
    const psql = (args: string[]) => execFileSync('psql', ['-h', dir, '-p', '55454', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const as = (uid: string, q: string) => psql(['-q', '-Atc', `SET ROLE authenticated; SET app.uid='${uid}'; ${q}`]);
    const asService = (q: string) => psql(['-q', '-Atc', `SET ROLE service_role; SET app.role='service_role'; ${q}`]);
    const fails = (uid: string, q: string) => { try { as(uid, q); return ''; } catch (e) { return String((e as { stderr?: string }).stderr); } };
    let started = false;
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -p 55454 -h ''`, '-w', 'start']);
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
      psql(['-f', resolve('setup/board-v15.sql')]);
      psql(['-f', resolve('setup/board-v16.sql')]);
      psql(['-f', resolve('setup/board-v17.sql')]);
      psql(['-f', resolve('setup/board-v18.sql')]);
      psql(['-f', resolve('setup/board-v18.sql')]); // re-runnable

      const payload = JSON.stringify({ scheduled_at: '2026-11-20T18:00:00+01:00', mode: 'ibrido', location: 'Piacenza', video_link: 'https://example.org/meeting', minute_taker_id: CONS,
        agenda: [{ kind: 'discussione', title: 'Attività' }], guests: [] });
      const id = as(PRES, `SELECT board_save_meeting(NULL,'${payload}'::jsonb)`);
      as(PRES, `SELECT board_set_status('${id}','CONVOCATO')`);
      const pid = (u: string) => as(PRES, `SELECT id FROM board_meeting_participants WHERE meeting_id='${id}' AND user_id='${u}'`);
      const attend = (p: string) => `SELECT board_attendance_set('${id}','${p}',true,'presenza',true,'Identita verificata')`;
      as(PRES, attend(pid(PRES))); as(CONS, attend(pid(CONS))); as(PRES, attend(pid(C5)));
      as(PRES, `SELECT board_session_action('${id}','open')`);

      // No recording without a recorded consent.
      expect(fails(C5, `SELECT board_audio_track_start('${id}','individual')`)).toMatch(/consenso alla registrazione/);
      as(C5, `SELECT board_recording_consent_set('${id}',true,'v1')`);
      expect(as(PRES, `SELECT board_recording_consent_current('${id}')`)).toBe('f'); // president has not consented
      const t1 = as(C5, `SELECT board_audio_track_start('${id}','individual')`);
      expect(as(PRES, `SELECT kind||':'||status FROM board_audio_tracks WHERE id='${t1}'`)).toBe('individual:in_registrazione');

      // The file path is bound to meeting and track.
      expect(fails(C5, `SELECT board_audio_track_finish('${t1}','altro/percorso.webm',60)`)).toMatch(/percorso del file non valido/);
      as(C5, `SELECT board_audio_track_finish('${t1}','${id}/${t1}.webm',60)`);
      expect(as(PRES, `SELECT status||':'||duration_seconds FROM board_audio_tracks WHERE id='${t1}'`)).toBe('caricata:60');

      // Shared track: only President or minute taker.
      expect(fails(C5, `SELECT board_audio_track_start('${id}','shared')`)).toMatch(/Presidente o il verbalizzante/);
      const t2 = as(CONS, `SELECT board_audio_track_start('${id}','shared')`);
      as(CONS, `SELECT board_audio_track_finish('${t2}','${id}/${t2}.webm',120)`);

      // Revoking consent blocks new individual tracks but never excludes from the meeting.
      as(C5, `SELECT board_recording_consent_set('${id}',false,'v1')`);
      expect(fails(C5, `SELECT board_audio_track_start('${id}','individual')`)).toMatch(/consenso alla registrazione/);
      expect(as(PRES, `SELECT present FROM board_meeting_participants WHERE id='${pid(C5)}'`)).toBe('t');

      // Transcripts are written by the service only, with validated segments.
      expect(fails(PRES, `SELECT board_audio_track_update_service('${t1}','trascritta','[]'::jsonb,NULL)`)).toMatch(/riservato al servizio|permission denied/);
      expect(() => asService(`SELECT board_audio_track_update_service('${t1}','trascritta','[{"start":0,"end":1,"speaker":null,"text":"","attribution":"incerta"}]'::jsonb,NULL)`)).toThrow();
      asService(`SELECT board_audio_track_update_service('${t1}','trascritta','[{"start":0,"end":5,"speaker":"Carlo Segretario","text":"Intervento di prova","attribution":"verificata"}]'::jsonb,NULL)`);
      expect(as(PRES, `SELECT status FROM board_audio_tracks WHERE id='${t1}'`)).toBe('trascritta');
      asService(`SELECT board_audio_track_update_service('${t2}','errore',NULL,'provider non raggiungibile')`);
      expect(as(PRES, `SELECT status||':'||transcript_error FROM board_audio_tracks WHERE id='${t2}'`)).toBe('errore:provider non raggiungibile');

      // A transcribed track stays on record; an uploaded one can be removed by the manager.
      expect(fails(PRES, `SELECT board_audio_track_delete('${t1}')`)).toMatch(/resta a registro/);
      expect(fails(C5, `SELECT board_audio_track_delete('${t2}')`)).toMatch(/Presidente o il verbalizzante/);
      as(PRES, `SELECT board_audio_track_delete('${t2}')`);
      expect(as(PRES, `SELECT count(*) FROM board_audio_tracks WHERE id='${t2}'`)).toBe('0');

      // AI settings: read by board members, written only by the President.
      expect(fails(C5, `SELECT board_ai_settings_save(true,'openai','https://api.openai.com/v1','whisper-1',0.006,5,'v1')`)).toMatch(/solo il Presidente/);
      expect(fails(PRES, `SELECT board_ai_settings_save(true,'openai','http://insicuro.example','whisper-1',0.006,5,'v1')`)).toMatch(/https/);
      as(PRES, `SELECT board_ai_settings_save(true,'openai','https://api.openai.com/v1','whisper-1',0.006,5,'v1')`);
      expect(as(C5, `SELECT enabled FROM board_ai_settings`)).toBe('t');

      // Non-board users see nothing.
      expect(as(FOUNDER, `SELECT count(*) FROM board_audio_tracks`)).toBe('0');
      expect(as(FOUNDER, `SELECT count(*) FROM board_recording_consents`)).toBe('0');
      expect(as(FOUNDER, `SELECT count(*) FROM board_ai_settings`)).toBe('0');

      // Clients cannot write the tables directly.
      expect(fails(C5, `INSERT INTO board_recording_consents(meeting_id,participant_id,user_id,consented,notice_version) VALUES ('${id}','${pid(C5)}','${C5}',true,'v1')`)).toMatch(/permission denied/);
      expect(fails(PRES, `UPDATE board_audio_tracks SET status='trascritta'`)).toMatch(/permission denied/);
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
