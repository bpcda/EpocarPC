-- Test su DB isolato dopo board-schema.sql e board-v15…v20.sql.
CREATE TEMP TABLE scenario(meeting uuid, minutes uuid, track uuid, dossier uuid, old_dossier uuid, prepared jsonb);
GRANT ALL ON scenario TO authenticated, service_role;
CREATE FUNCTION pg_temp.expect_error(_query text, _pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _query;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ _pattern THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'expected rejection: %', _query;
END $$;

SET ROLE authenticated;
SET app.role = 'authenticated';
SET app.uid = '00000000-0000-4000-8000-000000000001';
INSERT INTO scenario(meeting) SELECT board_save_meeting(NULL, '{"scheduled_at":"2026-11-20T18:00:00+01:00","mode":"presenza","location":"Piacenza","minute_taker_id":"00000000-0000-4000-8000-000000000002","agenda":[{"kind":"discussione","title":"Programma"}],"guests":[]}');
SELECT board_set_status(meeting,'CONVOCATO') FROM scenario;
SELECT board_attendance_set(meeting,p.id,true,'presenza',true,'Verificata') FROM scenario s JOIN board_meeting_participants p ON p.meeting_id=s.meeting;
SELECT board_session_action(meeting,'open') FROM scenario;
SELECT pg_temp.expect_error(format('SELECT board_dossier_prepare(%L)',meeting),'chiudere la seduta') FROM scenario;
UPDATE scenario SET minutes = board_minutes_save(meeting,'Verbale originale','manuale');
SELECT board_recording_consent_set(meeting,true,'v1') FROM scenario;
UPDATE scenario SET track = board_audio_track_start(meeting,'shared');
INSERT INTO storage.objects(bucket_id,name) SELECT 'board-audio',meeting||'/'||track||'.webm' FROM scenario;
SELECT board_audio_track_finish(track,meeting||'/'||track||'.webm',30) FROM scenario;

SET ROLE service_role;
SET app.role = 'service_role';
SELECT board_audio_track_update_service(track,'trascritta','[{"start":0,"end":5,"speaker":null,"text":"temporary speech","attribution":"incerta"}]',NULL) FROM scenario;
RESET ROLE;
INSERT INTO board_meeting_events(meeting_id,action) SELECT meeting,'test_event' FROM scenario,generate_series(1,1205);

SET ROLE authenticated;
SET app.role = 'authenticated';
SELECT board_minutes_submit_vote(minutes) FROM scenario;
SELECT board_ballot_vote(id,'favorevole') FROM board_ballots WHERE status='aperta';
SET app.uid = '00000000-0000-4000-8000-000000000002';
SELECT board_ballot_vote(id,'favorevole') FROM board_ballots WHERE status='aperta';
SET app.uid = '00000000-0000-4000-8000-000000000001';
SELECT board_ballot_close(id) FROM board_ballots WHERE status='aperta';
INSERT INTO storage.objects(bucket_id,name) SELECT 'board-documents',meeting||'/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf' FROM scenario;
SELECT board_minutes_signed(minutes,meeting||'/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf') FROM scenario;

-- Una rettifica invalida sempre l'abbinamento alla firma della versione precedente.
SELECT board_minutes_save(meeting,'Verbale rettificato','rettifica') FROM scenario;
DO $$ BEGIN ASSERT (SELECT signed_path IS NULL AND signed_at IS NULL FROM board_minutes); END $$;
SELECT board_minutes_submit_vote(minutes) FROM scenario;
SELECT board_ballot_vote(id,'favorevole') FROM board_ballots WHERE status='aperta';
SET app.uid = '00000000-0000-4000-8000-000000000002';
SELECT board_ballot_vote(id,'favorevole') FROM board_ballots WHERE status='aperta';
SET app.uid = '00000000-0000-4000-8000-000000000001';
SELECT board_ballot_close(id) FROM board_ballots WHERE status='aperta';
SELECT board_session_action(meeting,'close') FROM scenario;
SELECT pg_temp.expect_error(format('SELECT board_dossier_prepare(%L)',meeting),'versione firmata') FROM scenario;
SELECT board_minutes_signed(minutes,meeting||'/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf') FROM scenario;
DO $$ BEGIN ASSERT (SELECT signed_version=current_version FROM board_minutes); END $$;

-- Una firma legacy priva del riferimento alla versione non diventa valida per effetto dell'aggiornamento.
RESET ROLE;
UPDATE board_minutes SET signed_version=NULL;
SET ROLE authenticated;
SELECT pg_temp.expect_error(format('SELECT board_dossier_prepare(%L)',meeting),'copia firmata della versione corrente') FROM scenario;
SELECT board_minutes_signed(minutes,meeting||'/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf') FROM scenario;

-- I lettori non possono caricare fascicoli, rimuovere la firma o cancellare un audio trascritto.
SET app.uid = '00000000-0000-4000-8000-000000000003';
SELECT pg_temp.expect_error(format('INSERT INTO storage.objects(bucket_id,name) VALUES (''board-documents'',%L)', meeting||'/fascicolo-22222222-2222-4222-8222-222222222222.zip'),'row-level security') FROM scenario;
DELETE FROM storage.objects WHERE bucket_id='board-documents';
DELETE FROM storage.objects WHERE bucket_id='board-audio';
DO $$ BEGIN ASSERT (SELECT count(*)=2 FROM storage.objects); END $$;
SELECT pg_temp.expect_error(format('SELECT board_dossier_prepare(%L)',meeting),'Presidente o il verbalizzante') FROM scenario;

SET app.uid = '00000000-0000-4000-8000-000000000001';
UPDATE scenario SET prepared=board_dossier_prepare(meeting);
DO $$ BEGIN
  ASSERT (SELECT jsonb_array_length((prepared->>'snapshot')::jsonb->'events')>1205 FROM scenario);
  ASSERT (SELECT position('temporary speech' IN prepared->>'snapshot')=0 FROM scenario);
END $$;

SET ROLE service_role;
SET app.role = 'service_role';
INSERT INTO storage.objects(bucket_id,name) SELECT 'board-documents',meeting||'/fascicolo-22222222-2222-4222-8222-222222222222.zip' FROM scenario;
INSERT INTO storage.objects(bucket_id,name) SELECT 'board-documents',meeting||'/fascicolo-33333333-3333-4333-8333-333333333333.zip' FROM scenario;
SET ROLE authenticated;
SET app.role = 'authenticated';
UPDATE scenario SET old_dossier=board_dossier_register(meeting,prepared->>'revision',meeting||'/fascicolo-22222222-2222-4222-8222-222222222222.zip',repeat('a',64));
SELECT pg_temp.expect_error('UPDATE board_dossiers SET sha256=repeat(''b'',64)','permission denied');

-- Una rettifica proposta e valutata dopo l'esportazione rende il vecchio fascicolo superato.
SET app.uid = '00000000-0000-4000-8000-000000000003';
SELECT board_minutes_rectify(minutes,'Precisazione aggiuntiva da valutare') FROM scenario;
SET app.uid = '00000000-0000-4000-8000-000000000001';
SELECT board_minutes_rectification_decide(id,'non_accolta') FROM board_minute_rectifications;
SELECT pg_temp.expect_error(format('SELECT board_dossier_begin_archive(%L)',old_dossier),'fascicolo superato') FROM scenario;
UPDATE scenario SET prepared=board_dossier_prepare(meeting);
UPDATE scenario SET dossier=board_dossier_register(meeting,prepared->>'revision',meeting||'/fascicolo-33333333-3333-4333-8333-333333333333.zip',repeat('b',64));

SET app.uid = '00000000-0000-4000-8000-000000000005';
SELECT pg_temp.expect_error(format('SELECT board_dossier_begin_archive(%L)',dossier),'Presidente o il verbalizzante') FROM scenario;
DO $$ BEGIN ASSERT (SELECT count(*)=2 FROM board_dossiers); END $$;
SET app.uid = '00000000-0000-4000-8000-000000000004';
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM board_dossiers); END $$;

SET app.uid = '00000000-0000-4000-8000-000000000001';
SELECT board_dossier_begin_archive(dossier) FROM scenario;
SELECT board_dossier_begin_archive(dossier) FROM scenario; -- retry
DO $$ BEGIN ASSERT (SELECT status='ESPORTATO' FROM board_meetings); END $$;
SELECT pg_temp.expect_error(format('SELECT board_minutes_save(%L,''Nuovo testo'',''rettifica'')',meeting),'atti bloccati') FROM scenario;
SELECT pg_temp.expect_error(format('SELECT board_recording_consent_set(%L,true,''v1'')',meeting),'atti bloccati') FROM scenario;
SELECT pg_temp.expect_error(format('SELECT board_dossier_finish_archive(%L)',dossier),'permission denied') FROM scenario;

SET ROLE service_role;
SET app.role = 'service_role';
SELECT pg_temp.expect_error(format('SELECT board_dossier_finish_archive(%L)',dossier),'audio non ancora completata') FROM scenario;
DO $$ BEGIN ASSERT (SELECT transcript IS NOT NULL FROM board_audio_tracks); END $$;
SELECT pg_temp.expect_error('UPDATE board_dossiers SET snapshot=''{}''','immutabile');
-- Simula esclusivamente nel DB isolato la rimozione fisica via Storage API, prima di eliminare le trascrizioni.
DELETE FROM storage.objects WHERE bucket_id='board-audio';
SELECT board_dossier_finish_archive(dossier) FROM scenario;
SELECT board_dossier_finish_archive(dossier) FROM scenario; -- retry dopo risposta persa
DO $$ BEGIN
  ASSERT (SELECT status='ARCHIVIATO' FROM board_meetings);
  ASSERT (SELECT count(*)=0 FROM board_audio_tracks);
  ASSERT (SELECT count(*)=1 FROM board_recording_consents);
  ASSERT (SELECT count(*)=1 FROM board_minutes WHERE status='APPROVATO' AND signed_path IS NOT NULL);
  ASSERT (SELECT count(*)=4 FROM board_votes);
  ASSERT (SELECT count(*)=1 FROM board_meeting_events WHERE action='dossier_archived');
END $$;
SELECT pg_temp.expect_error('UPDATE board_minute_versions SET body=''Modifica''','atti bloccati');
