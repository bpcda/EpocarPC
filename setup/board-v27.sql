-- Consiglio: revisione a posteriori, impronta stabile e collegamento automatico. Dopo v26.
BEGIN;
CREATE OR REPLACE FUNCTION public.board_ai_context_as(_meeting uuid,_minutes uuid,_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.board_meetings; _n public.board_minutes; _q jsonb; _data jsonb; _total integer; _present integer;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting;
  IF NOT public.board_manager_as(_meeting,_actor) OR _m.started_at IS NULL OR _m.status IN ('ANNULLATO','ESPORTATO','ARCHIVIATO') THEN RAISE EXCEPTION 'seduta o autorizzazione non valida'; END IF;
  SELECT * INTO _n FROM public.board_minutes WHERE meeting_id=_meeting AND ((_minutes IS NULL AND origin_minutes_id IS NULL) OR id=_minutes);
  IF _minutes IS NOT NULL AND _n.id IS NULL THEN RAISE EXCEPTION 'atto non disponibile'; END IF;
  IF _n.id IS NOT NULL AND (_n.status NOT IN ('BOZZA','IN_REVISIONE') OR _n.signed_path IS NOT NULL) THEN RAISE EXCEPTION 'atto non modificabile'; END IF;
  SELECT count(DISTINCT user_id) INTO _total FROM public.user_roles WHERE role::text IN ('president','vice_president','secretary','treasurer','councillor');
  SELECT count(DISTINCT p.user_id) INTO _present FROM public.board_meeting_participants p WHERE p.meeting_id=_meeting AND p.kind='member' AND p.can_vote AND p.present AND p.identified_at IS NOT NULL AND public.is_board_member(p.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c WHERE c.participant_id=p.id AND c.returned_at IS NULL);
  _q:=jsonb_build_object('total',_total,'present',_present,'required',_total/2+1,'met',_total>0 AND _present>=_total/2+1);
  _data:=jsonb_build_object('meeting',to_jsonb(_m),'minutes',to_jsonb(_n),'quorum',_q,
    'participants',COALESCE((SELECT jsonb_agg((to_jsonb(p)-'last_seen_at')||jsonb_build_object('current_board_office',public.is_board_member(p.user_id)) ORDER BY p.id) FROM public.board_meeting_participants p WHERE p.meeting_id=_meeting),'[]'),
    'agenda',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.position) FROM public.board_agenda_items a WHERE a.meeting_id=_meeting),'[]'),
    'deliberations',COALESCE((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object(
      'documents',(SELECT jsonb_agg(to_jsonb(f)-'pending_path' ORDER BY f.id) FROM public.board_deliberation_documents f WHERE f.deliberation_id=d.id),
      'official_versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version) FROM public.board_deliberation_versions v WHERE v.deliberation_id=d.id),
      'ballots',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.opened_at) FROM public.board_ballots b WHERE b.deliberation_id=d.id)) ORDER BY d.number) FROM public.board_deliberations d WHERE d.meeting_id=_meeting),'[]'),
    'transcripts',COALESCE((SELECT jsonb_agg(jsonb_build_object('track_id',t.id,'kind',t.kind,'segments',t.transcript) ORDER BY t.created_at) FROM public.board_audio_tracks t WHERE t.meeting_id=_meeting AND t.status='trascritta'),'[]'),
    'events',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.board_meeting_events e WHERE e.meeting_id=_meeting AND e.action NOT LIKE 'ai_%' AND e.action NOT LIKE 'documents_%' AND e.action NOT IN ('audio_transcribed','audio_error')),'[]'),
    'current_text',(SELECT body FROM public.board_minute_versions WHERE minutes_id=_n.id AND version=_n.current_version),
    'origin',CASE WHEN _n.origin_minutes_id IS NOT NULL THEN (SELECT jsonb_build_object('minutes_id',v.minutes_id,'version',v.version,'body',v.body) FROM public.board_minute_versions v WHERE v.minutes_id=_n.origin_minutes_id AND v.version=_n.origin_version) END);
  IF octet_length(_data::text)>2000000 THEN RAISE EXCEPTION 'contesto oltre il limite: redigere il verbale manualmente'; END IF;
  RETURN _data;
END $$;

CREATE OR REPLACE FUNCTION public.board_session_action(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _next text; _approved boolean := false;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF NOT public.board_is_chair(_id) THEN RAISE EXCEPTION 'solo il Presidente'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  IF _action = 'open' AND _m.status = 'CONVOCATO' AND _m.started_at IS NULL THEN
    PERFORM public.board_sync_members(_id);
    _next := 'IN_CORSO';
    UPDATE public.board_meetings SET started_at = now(), chair_id = COALESCE(chair_id, auth.uid()),
      chair_kind = COALESCE(chair_kind, 'president') WHERE id = _id;
  ELSIF _action = 'suspend' AND _m.status = 'IN_CORSO' THEN
    IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivazione obbligatoria'; END IF;
    _next := 'SOSPESO';
  ELSIF _action = 'resume' AND _m.status = 'SOSPESO' AND _m.started_at IS NOT NULL AND _m.ended_at IS NULL THEN
    _next := 'IN_CORSO';
  ELSIF _action = 'close' AND _m.status IN ('IN_CORSO','SOSPESO') AND _m.started_at IS NOT NULL AND _m.ended_at IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id = _id AND status = 'aperta') THEN
      RAISE EXCEPTION 'concludi o annulla la votazione aperta prima di chiudere la seduta'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.board_minutes WHERE meeting_id = _id AND origin_minutes_id IS NULL AND status = 'APPROVATO') AND NOT EXISTS (SELECT 1 FROM public.board_minutes WHERE meeting_id=_id AND status<>'APPROVATO') INTO _approved;
    IF NOT _approved AND COALESCE(trim(_reason),'') = '' THEN
      _reason := 'Verbale da redigere e revisionare dopo la chiusura'; END IF;
    _next := CASE WHEN _approved THEN 'APPROVATO' ELSE 'VERBALE_IN_REVISIONE' END;
    UPDATE public.board_meetings SET ended_at = now(), active_agenda_id = NULL WHERE id = _id;
    UPDATE public.board_agenda_items SET discussion_status = 'discussed' WHERE meeting_id = _id AND discussion_status = 'current';
  ELSE RAISE EXCEPTION 'azione non consentita nello stato corrente'; END IF;
  UPDATE public.board_meetings SET status = _next, status_reason = NULLIF(trim(_reason),''), updated_at = now() WHERE id = _id;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail)
    VALUES (_id,auth.uid(),'session_'||_action,jsonb_build_object('from',_m.status,'to',_next,'reason',_reason,'quorum',public.board_quorum(_id)));
END $$;

CREATE OR REPLACE FUNCTION public.board_minutes_rectify(_minutes uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _name text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_minutes WHERE id = _minutes) FOR UPDATE;
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _minutes;
  IF _mn.id IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
  IF NOT public.board_can_view(_mn.meeting_id) OR _mn.status='APPROVATO' OR _mn.signed_path IS NOT NULL OR EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_mn.meeting_id AND status IN ('ESPORTATO','ARCHIVIATO')) THEN RAISE EXCEPTION 'atto definitivo: proporre una rettifica in una nuova seduta'; END IF;
  IF _mn.status = 'IN_APPROVAZIONE' THEN RAISE EXCEPTION 'verbale in approvazione: attendere l''esito'; END IF;
  IF COALESCE(length(trim(_body)),0) < 5 THEN RAISE EXCEPTION 'la rettifica è troppo breve'; END IF;
  IF length(trim(_body)) > 4000 THEN RAISE EXCEPTION 'la rettifica è troppo lunga'; END IF;
  SELECT COALESCE(NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),''),'Componente senza nome')
    INTO _name FROM public.profiles p WHERE p.user_id = auth.uid();
  INSERT INTO public.board_minute_rectifications(minutes_id, author_id, author_name, body)
    VALUES (_minutes, auth.uid(), COALESCE(_name,'Componente senza nome'), trim(_body));
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_mn.meeting_id, auth.uid(), 'minutes_rectification',
      jsonb_build_object('minutes_id', _minutes, 'name', COALESCE(_name,'Componente senza nome')));
END $$;

CREATE OR REPLACE FUNCTION public.board_save_meeting(_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _mid uuid; _internal boolean;
BEGIN
  PERFORM public.board_before_start(_id);
  _internal := COALESCE(_payload->>'mode','presenza') IN ('remoto','ibrido') AND COALESCE(trim(_payload->>'video_link'),'')='';
  IF _internal THEN _payload := _payload || jsonb_build_object('video_link','https://epocarpc.com/consiglio-direttivo'); END IF;
  _mid := public.board_save_meeting_phase1(_id,_payload);
  IF _internal THEN UPDATE public.board_meetings SET video_link='https://epocarpc.com/consiglio-direttivo?seduta='||_mid::text WHERE id=_mid; END IF;
  RETURN _mid;
END $$;

CREATE OR REPLACE FUNCTION public.board_recording_lease(_track uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _t public.board_audio_tracks; _item jsonb; _p public.board_meeting_participants; _c public.board_recording_consents;
BEGIN
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id=_track AND created_by=auth.uid();
  IF _t.id IS NULL OR _t.status<>'in_registrazione' OR NOT public.is_board_member(auth.uid()) OR jsonb_array_length(_t.consent_snapshot)=0 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_t.meeting_id AND status='IN_CORSO' AND ended_at IS NULL) OR EXISTS (
    SELECT 1 FROM public.board_meeting_events WHERE meeting_id=_t.meeting_id AND action IN ('session_suspend','session_close') AND created_at>=_t.started_at) THEN RETURN false; END IF;
  IF _t.kind='shared' AND NOT public.board_manager_as(_t.meeting_id,auth.uid()) THEN RETURN false; END IF;
  IF _t.kind='shared' AND EXISTS (SELECT 1 FROM public.board_meeting_participants p WHERE p.meeting_id=_t.meeting_id AND p.present AND p.attendance_mode='presenza' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_t.consent_snapshot) s WHERE s->>'participant_id'=p.id::text)) THEN RETURN false; END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_t.consent_snapshot) LOOP
    SELECT * INTO _p FROM public.board_meeting_participants WHERE id=(_item->>'participant_id')::uuid;
    IF _p.id IS NULL OR NOT _p.present OR _p.identified_at IS NULL OR _p.identified_at::text IS DISTINCT FROM (_item->>'identified_at')::timestamptz::text OR (_p.kind='member' AND NOT public.is_board_member(_p.user_id)) THEN RETURN false; END IF;
    SELECT * INTO _c FROM public.board_recording_consents WHERE participant_id=_p.id ORDER BY id DESC LIMIT 1;
    IF _c.id IS NULL OR NOT _c.consented OR _c.notice_version IS DISTINCT FROM _item->>'notice_version' OR _c.notice_version IS DISTINCT FROM (SELECT notice_version FROM public.board_ai_settings WHERE id=true) OR EXISTS (
      SELECT 1 FROM public.board_recording_consents WHERE participant_id=_p.id AND id>(_item->>'consent_id')::bigint AND NOT consented) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
