-- Dati sintetici, dopo board-schema.sql e board-v15…v21.sql.
CREATE TEMP TABLE session_scenario(kind text, meeting uuid, minutes uuid, ballot uuid);
GRANT ALL ON session_scenario TO authenticated;
CREATE FUNCTION pg_temp.session_expect_error(_query text, _pattern text) RETURNS void LANGUAGE plpgsql AS $$
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
INSERT INTO session_scenario(kind, meeting)
  SELECT kind, board_save_meeting(NULL, '{"scheduled_at":"2026-11-20T18:00:00+01:00","mode":"presenza","location":"Piacenza","minute_taker_id":"00000000-0000-4000-8000-000000000002","agenda":[{"kind":"discussione","title":"Programma"}],"guests":[]}')
  FROM (VALUES ('approved'), ('no_quorum')) AS kinds(kind);
SELECT board_set_status(meeting,'CONVOCATO') FROM session_scenario;
SELECT board_attendance_set(s.meeting,p.id,true,'presenza',true,'Identità verificata')
  FROM session_scenario s JOIN board_meeting_participants p ON p.meeting_id=s.meeting WHERE s.kind='approved';
SELECT board_session_action(meeting,'open') FROM session_scenario;

-- Nessun quorum: chiusura ammessa con motivo, senza falsa approvazione e senza moduli aggiuntivi.
SELECT pg_temp.session_expect_error(format('SELECT board_session_action(%L,''close'')',meeting),'motivo della chiusura')
  FROM session_scenario WHERE kind='no_quorum';
SELECT pg_temp.session_expect_error(format('SELECT board_session_action(%L,''close'',''   '')',meeting),'motivo della chiusura')
  FROM session_scenario WHERE kind='no_quorum';
SET app.uid = '00000000-0000-4000-8000-000000000005';
SELECT pg_temp.session_expect_error(format('SELECT board_session_action(%L,''close'',''Fine'')',meeting),'solo il Presidente')
  FROM session_scenario;
SET app.uid = '00000000-0000-4000-8000-000000000001';
SELECT board_session_action(meeting,'suspend','Verifica presenze') FROM session_scenario WHERE kind='no_quorum';
SELECT board_session_action(meeting,'close','Quorum non raggiunto') FROM session_scenario WHERE kind='no_quorum';
DO $$ BEGIN
  ASSERT (SELECT m.status='VERBALE_IN_REVISIONE' AND m.ended_at IS NOT NULL AND m.status_reason='Quorum non raggiunto'
    FROM session_scenario s JOIN board_meetings m ON m.id=s.meeting WHERE s.kind='no_quorum');
  ASSERT (SELECT count(*)=1 FROM board_meeting_events e JOIN session_scenario s ON s.meeting=e.meeting_id
    WHERE s.kind='no_quorum' AND e.action='session_close' AND e.detail->>'reason'='Quorum non raggiunto');
END $$;
UPDATE session_scenario SET minutes=board_minutes_save(meeting,'Resoconto della seduta senza quorum','manuale') WHERE kind='no_quorum';
SELECT pg_temp.session_expect_error(format('SELECT board_minutes_submit_vote(%L)',minutes),'seduta non è in corso')
  FROM session_scenario WHERE kind='no_quorum';

-- Una votazione aperta impedisce la chiusura anche se si invia una motivazione.
UPDATE session_scenario SET minutes=board_minutes_save(meeting,'Verbale da approvare','manuale') WHERE kind='approved';
UPDATE session_scenario SET ballot=board_minutes_submit_vote(minutes) WHERE kind='approved';
SELECT pg_temp.session_expect_error(format('SELECT board_session_action(%L,''close'',''Fine seduta'')',meeting),'votazione aperta')
  FROM session_scenario WHERE kind='approved';
DO $$ BEGIN
  ASSERT (SELECT m.status='IN_CORSO' AND m.ended_at IS NULL
    FROM session_scenario s JOIN board_meetings m ON m.id=s.meeting WHERE s.kind='approved');
END $$;
SELECT board_ballot_vote(ballot,'favorevole') FROM session_scenario WHERE kind='approved';
SET app.uid = '00000000-0000-4000-8000-000000000002';
SELECT board_ballot_vote(ballot,'favorevole') FROM session_scenario WHERE kind='approved';
SET app.uid = '00000000-0000-4000-8000-000000000001';
SELECT board_ballot_close(ballot) FROM session_scenario WHERE kind='approved';

-- Anche un voto su una delibera blocca la chiusura dopo l'approvazione del verbale.
UPDATE session_scenario SET ballot=board_ballot_open(board_deliberation_save(meeting,NULL,'{"title":"Punto aggiuntivo","body":"Testo della proposta"}'))
  WHERE kind='approved';
SELECT pg_temp.session_expect_error(format('SELECT board_session_action(%L,''close'')',meeting),'votazione aperta')
  FROM session_scenario WHERE kind='approved';
SELECT board_ballot_cancel(ballot,'Proposta rinviata') FROM session_scenario WHERE kind='approved';
SELECT board_session_action(meeting,'close') FROM session_scenario WHERE kind='approved';
DO $$ BEGIN
  ASSERT (SELECT m.status='APPROVATO' AND m.ended_at IS NOT NULL
    FROM session_scenario s JOIN board_meetings m ON m.id=s.meeting WHERE s.kind='approved');
END $$;
SELECT pg_temp.session_expect_error(format('SELECT board_minutes_submit_vote(%L)',minutes),'seduta non è in corso')
  FROM session_scenario WHERE kind='approved';
SELECT pg_temp.session_expect_error(format('SELECT board_minutes_save(%L,''Modifica postuma'',''rettifica'')',meeting),'rettifiche si trattano in una nuova seduta')
  FROM session_scenario WHERE kind='approved';
DO $$ BEGIN
  ASSERT (SELECT mn.status='APPROVATO' AND mn.current_version=1 AND v.body='Verbale da approvare'
    FROM session_scenario s JOIN board_minutes mn ON mn.id=s.minutes
    JOIN board_minute_versions v ON v.minutes_id=mn.id AND v.version=mn.current_version WHERE s.kind='approved');
END $$;

-- Dopo la chiusura restano consentiti firma e fascicolo della versione approvata.
INSERT INTO storage.objects(bucket_id,name)
  SELECT 'board-documents',meeting||'/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf'
  FROM session_scenario WHERE kind='approved';
SELECT board_minutes_signed(minutes,meeting||'/verbale_firmato-11111111-1111-4111-8111-111111111111.pdf')
  FROM session_scenario WHERE kind='approved';
SELECT board_dossier_prepare(meeting) FROM session_scenario WHERE kind='approved';
RESET ROLE;
