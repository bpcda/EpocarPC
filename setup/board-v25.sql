-- Consiglio: consenso audio, prenotazioni atomiche IA e contesto ufficiale. Dopo v24.
BEGIN;
ALTER TABLE public.board_recording_consents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.board_recording_consents ADD COLUMN IF NOT EXISTS recorded_by uuid;
ALTER TABLE public.board_recording_consents ADD COLUMN IF NOT EXISTS evidence text;
ALTER TABLE public.board_audio_tracks ADD COLUMN IF NOT EXISTS consent_snapshot jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.board_audio_tracks ADD COLUMN IF NOT EXISTS duration_verified_at timestamptz;
ALTER TABLE public.board_ai_settings ADD COLUMN IF NOT EXISTS draft_input_per_million_eur numeric(12,6) CHECK (draft_input_per_million_eur>=0);
ALTER TABLE public.board_ai_settings ADD COLUMN IF NOT EXISTS draft_output_per_million_eur numeric(12,6) CHECK (draft_output_per_million_eur>=0);
ALTER TABLE public.board_ai_settings ADD COLUMN IF NOT EXISTS draft_max_tokens integer NOT NULL DEFAULT 4000 CHECK (draft_max_tokens BETWEEN 256 AND 12000);
DROP TRIGGER IF EXISTS board_consents_immutable ON public.board_recording_consents;
CREATE TRIGGER board_consents_immutable BEFORE UPDATE OR DELETE ON public.board_recording_consents FOR EACH ROW EXECUTE FUNCTION public.board_events_immutable();

CREATE OR REPLACE FUNCTION public.board_guest_consent_set(_meeting uuid,_participant uuid,_consented boolean,_evidence text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _p public.board_meeting_participants; _notice text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=_meeting AND ended_at IS NULL AND status IN ('CONVOCATO','IN_CORSO','SOSPESO') FOR UPDATE;
  IF NOT FOUND OR NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN RAISE EXCEPTION 'seduta o autorizzazione non valida'; END IF;
  SELECT * INTO _p FROM public.board_meeting_participants WHERE id=_participant AND meeting_id=_meeting;
  IF _p.kind IS DISTINCT FROM 'guest' OR NOT _p.present OR _p.identified_at IS NULL OR _consented IS NULL OR COALESCE(length(trim(_evidence)),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'ospite identificato e attestazione esplicita obbligatori'; END IF;
  SELECT notice_version INTO _notice FROM public.board_ai_settings WHERE id=true;
  INSERT INTO public.board_recording_consents(meeting_id,participant_id,user_id,consented,notice_version,recorded_by,evidence)
    VALUES (_meeting,_participant,NULL,_consented,_notice,auth.uid(),trim(_evidence));
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,auth.uid(),'guest_recording_consent',jsonb_build_object('participant_id',_participant,'name',_p.display_name,'consented',_consented,'evidence',trim(_evidence)));
END $$;

CREATE OR REPLACE FUNCTION public.board_recording_consent_set(_meeting uuid,_consented boolean,_notice_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _p public.board_meeting_participants;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=_meeting AND ended_at IS NULL AND status IN ('CONVOCATO','IN_CORSO','SOSPESO') FOR UPDATE;
  IF NOT FOUND OR NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'seduta o carica non valida'; END IF;
  SELECT * INTO _p FROM public.board_meeting_participants WHERE meeting_id=_meeting AND user_id=auth.uid() AND kind='member';
  IF _p.id IS NULL OR _consented IS NULL OR _notice_version IS DISTINCT FROM (SELECT notice_version FROM public.board_ai_settings WHERE id=true) THEN RAISE EXCEPTION 'partecipante o informativa non validi'; END IF;
  INSERT INTO public.board_recording_consents(meeting_id,participant_id,user_id,consented,notice_version,recorded_by) VALUES (_meeting,_p.id,auth.uid(),_consented,_notice_version,auth.uid());
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,auth.uid(),'recording_consent',jsonb_build_object('participant_id',_p.id,'name',_p.display_name,'consented',_consented,'notice_version',_notice_version));
END $$;

CREATE OR REPLACE FUNCTION public.board_audio_track_start_with_participants(_meeting uuid,_kind text,_participants uuid[],_evidence text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.board_meetings; _ids uuid[]; _p public.board_meeting_participants; _c public.board_recording_consents; _snapshot jsonb:='[]'; _id uuid; _notice text;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting FOR UPDATE;
  IF _m.status IS DISTINCT FROM 'IN_CORSO' OR _m.started_at IS NULL OR _m.ended_at IS NOT NULL OR NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'seduta o carica non valida'; END IF;
  IF _kind='individual' THEN
    SELECT ARRAY[id] INTO _ids FROM public.board_meeting_participants WHERE meeting_id=_meeting AND user_id=auth.uid() AND kind='member';
  ELSIF _kind='shared' AND (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
    IF COALESCE(length(trim(_evidence)),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'attestazione dei consensi prima della registrazione obbligatoria'; END IF;
    _ids:=_participants;
  ELSE RAISE EXCEPTION 'tipo o autorizzazione non valida'; END IF;
  IF COALESCE(array_length(_ids,1),0) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT x) FROM unnest(_ids) x)<>array_length(_ids,1) THEN RAISE EXCEPTION 'indicare le persone incluse nella registrazione'; END IF;
  SELECT notice_version INTO _notice FROM public.board_ai_settings WHERE id=true;
  FOR _id IN SELECT unnest(_ids) LOOP
    SELECT * INTO _p FROM public.board_meeting_participants WHERE id=_id AND meeting_id=_meeting;
    IF _p.id IS NULL OR NOT _p.present OR _p.identified_at IS NULL OR (_p.kind='member' AND NOT public.is_board_member(_p.user_id)) THEN RAISE EXCEPTION 'presenza identificata obbligatoria per ogni persona inclusa'; END IF;
    SELECT * INTO _c FROM public.board_recording_consents WHERE participant_id=_p.id AND meeting_id=_meeting ORDER BY id DESC LIMIT 1;
    IF _c.id IS NULL OR NOT _c.consented OR _c.notice_version<>_notice THEN RAISE EXCEPTION 'manca il consenso corrente di una persona inclusa'; END IF;
    _snapshot:=_snapshot||jsonb_build_array(jsonb_build_object('participant_id',_p.id,'consent_id',_c.id,'notice_version',_notice,'identified_at',_p.identified_at,'name',_p.display_name,'shared_evidence',_evidence));
  END LOOP;
  INSERT INTO public.board_audio_tracks(meeting_id,participant_id,kind,created_by,consent_snapshot)
    VALUES (_meeting,CASE WHEN _kind='individual' THEN _ids[1] ELSE NULL END,_kind,auth.uid(),_snapshot) RETURNING id INTO _id;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,auth.uid(),'audio_track_start',jsonb_build_object('track_id',_id,'kind',_kind,'consents',_snapshot));
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.board_audio_track_start(_meeting uuid,_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.board_audio_track_start_with_participants(_meeting,_kind,NULL); END $$;

CREATE OR REPLACE FUNCTION public.board_recording_lease(_track uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _t public.board_audio_tracks; _item jsonb; _p public.board_meeting_participants; _c public.board_recording_consents;
BEGIN
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id=_track AND created_by=auth.uid();
  IF _t.id IS NULL OR _t.status<>'in_registrazione' OR NOT public.is_board_member(auth.uid()) OR jsonb_array_length(_t.consent_snapshot)=0 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_t.meeting_id AND status='IN_CORSO' AND ended_at IS NULL) OR EXISTS (
    SELECT 1 FROM public.board_meeting_events WHERE meeting_id=_t.meeting_id AND action IN ('session_suspend','session_close') AND created_at>=_t.started_at) THEN RETURN false; END IF;
  FOR _item IN SELECT * FROM jsonb_array_elements(_t.consent_snapshot) LOOP
    SELECT * INTO _p FROM public.board_meeting_participants WHERE id=(_item->>'participant_id')::uuid;
    IF _p.id IS NULL OR NOT _p.present OR _p.identified_at IS NULL OR _p.identified_at::text IS DISTINCT FROM (_item->>'identified_at')::timestamptz::text OR (_p.kind='member' AND NOT public.is_board_member(_p.user_id)) THEN RETURN false; END IF;
    SELECT * INTO _c FROM public.board_recording_consents WHERE participant_id=_p.id ORDER BY id DESC LIMIT 1;
    IF _c.id IS NULL OR NOT _c.consented OR _c.notice_version IS DISTINCT FROM _item->>'notice_version' OR _c.notice_version IS DISTINCT FROM (SELECT notice_version FROM public.board_ai_settings WHERE id=true) OR EXISTS (
      SELECT 1 FROM public.board_recording_consents WHERE participant_id=_p.id AND id>(_item->>'consent_id')::bigint AND NOT consented) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.board_audio_track_abort(_track uuid,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _t public.board_audio_tracks;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_audio_tracks WHERE id=_track) FOR UPDATE;
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id=_track FOR UPDATE;
  IF _t.created_by IS DISTINCT FROM auth.uid() OR _t.status IS DISTINCT FROM 'in_registrazione' OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='board-audio' AND name=_t.meeting_id::text||'/'||_track::text||'.webm') THEN RAISE EXCEPTION 'traccia non annullabile'; END IF;
  IF COALESCE(length(trim(_reason)),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'motivo obbligatorio'; END IF;
  DELETE FROM public.board_audio_tracks WHERE id=_track;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_t.meeting_id,auth.uid(),'audio_track_aborted',jsonb_build_object('track_id',_track,'reason',trim(_reason)));
END $$;

CREATE TABLE IF NOT EXISTS public.board_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('transcribe','draft')), target_id uuid NOT NULL, actor uuid NOT NULL,
  units bigint NOT NULL CHECK (units BETWEEN 1 AND 10000000), expected_revision integer NOT NULL,
  reference_hash text NOT NULL, reserved_cost numeric(14,6) NOT NULL CHECK (reserved_cost>=0),
  settings_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','running','succeeded','failed','cancelled')),
  result text, error text, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, ended_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS board_ai_one_running ON public.board_ai_jobs(kind,target_id) WHERE status IN ('reserved','running');
CREATE INDEX IF NOT EXISTS board_ai_jobs_meeting ON public.board_ai_jobs(meeting_id,created_at DESC);
ALTER TABLE public.board_ai_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_ai_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.board_ai_jobs TO authenticated;
GRANT ALL ON public.board_ai_jobs TO service_role;
DROP POLICY IF EXISTS board_ai_jobs_read ON public.board_ai_jobs;
CREATE POLICY board_ai_jobs_read ON public.board_ai_jobs FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));

-- Usato solo dal servizio; l'attore è ricavato dal JWT verificato dalla Edge Function.
CREATE OR REPLACE FUNCTION public.board_manager_as(_meeting uuid,_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_board_member(_actor) AND EXISTS (SELECT 1 FROM public.board_meetings m WHERE m.id=_meeting AND (
  m.minute_taker_id=_actor OR (m.chair_id=_actor AND (m.chair_kind='designated' OR m.chair_kind='president' AND public.is_board_president(_actor)
    OR m.chair_kind='vice' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text='vice_president')))
  OR m.chair_id IS NULL AND public.is_board_president(_actor) AND (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role::text='president')=1))
$$;

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
    'participants',COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('current_board_office',public.is_board_member(p.user_id)) ORDER BY p.id) FROM public.board_meeting_participants p WHERE p.meeting_id=_meeting),'[]'),
    'agenda',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.position) FROM public.board_agenda_items a WHERE a.meeting_id=_meeting),'[]'),
    'deliberations',COALESCE((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object(
      'documents',(SELECT jsonb_agg(to_jsonb(f)-'pending_path' ORDER BY f.id) FROM public.board_deliberation_documents f WHERE f.deliberation_id=d.id),
      'official_versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version) FROM public.board_deliberation_versions v WHERE v.deliberation_id=d.id),
      'ballots',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.opened_at) FROM public.board_ballots b WHERE b.deliberation_id=d.id)) ORDER BY d.number) FROM public.board_deliberations d WHERE d.meeting_id=_meeting),'[]'),
    'transcripts',COALESCE((SELECT jsonb_agg(jsonb_build_object('track_id',t.id,'kind',t.kind,'segments',t.transcript) ORDER BY t.created_at) FROM public.board_audio_tracks t WHERE t.meeting_id=_meeting AND t.status='trascritta'),'[]'),
    'events',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.board_meeting_events e WHERE e.meeting_id=_meeting AND e.action NOT LIKE 'ai_%'),'[]'),
    'current_text',(SELECT body FROM public.board_minute_versions WHERE minutes_id=_n.id AND version=_n.current_version),
    'origin',CASE WHEN _n.origin_minutes_id IS NOT NULL THEN (SELECT jsonb_build_object('minutes_id',v.minutes_id,'version',v.version,'body',v.body) FROM public.board_minute_versions v WHERE v.minutes_id=_n.origin_minutes_id AND v.version=_n.origin_version) END);
  IF octet_length(_data::text)>2000000 THEN RAISE EXCEPTION 'contesto oltre il limite: redigere il verbale manualmente'; END IF;
  RETURN _data;
END $$;

CREATE OR REPLACE FUNCTION public.board_ai_context(_meeting uuid,_minutes uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('context',c,'hash',md5(c::text),'revision',COALESCE((c->'minutes'->>'current_version')::integer,0)) FROM (SELECT public.board_ai_context_as(_meeting,_minutes,auth.uid()) c) x
$$;

CREATE OR REPLACE FUNCTION public.board_ai_reserve(_request uuid,_kind text,_target uuid,_actor uuid,_units bigint,_revision integer,_context_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _meeting uuid; _m public.board_meetings; _s public.board_ai_settings; _job public.board_ai_jobs; _cost numeric; _used numeric; _context jsonb;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  IF _kind='transcribe' THEN SELECT meeting_id INTO _meeting FROM public.board_audio_tracks WHERE id=_target;
  ELSIF _kind='draft' THEN SELECT meeting_id INTO _meeting FROM public.board_minutes WHERE id=_target;
  ELSE RAISE EXCEPTION 'elaborazione non valida'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting FOR UPDATE;
  IF _m.id IS NULL OR _m.status IN ('ESPORTATO','ARCHIVIATO') OR NOT public.board_manager_as(_meeting,_actor) THEN RAISE EXCEPTION 'autorizzazione o seduta non valida'; END IF;
  SELECT * INTO _job FROM public.board_ai_jobs WHERE request_id=_request;
  IF _job.id IS NOT NULL THEN
    IF _job.actor<>_actor OR _job.kind<>_kind OR _job.target_id<>_target THEN RAISE EXCEPTION 'richiesta già utilizzata'; END IF;
    RETURN to_jsonb(_job)||jsonb_build_object('existing',true);
  END IF;
  IF _units IS NULL OR _units NOT BETWEEN 1 AND 10000000 OR _context_hash IS NULL OR _context_hash !~ '^([0-9a-f]{32}|[0-9a-f]{64})$' THEN RAISE EXCEPTION 'misure o contesto non validi'; END IF;
  SELECT * INTO _s FROM public.board_ai_settings WHERE id=true;
  IF NOT _s.enabled THEN RAISE EXCEPTION 'IA disattivata'; END IF;
  IF _kind='transcribe' THEN
    IF _units>21600 OR NOT EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE id=_target AND status IN ('caricata','errore') AND storage_path IS NOT NULL AND jsonb_array_length(consent_snapshot)>0) THEN RAISE EXCEPTION 'traccia non elaborabile o consensi non documentati'; END IF;
    _cost:=ceil((_units::numeric*_s.cost_per_min_eur/60)*1000000)/1000000;
    UPDATE public.board_audio_tracks SET duration_seconds=_units,duration_verified_at=now() WHERE id=_target;
  ELSE
    _context:=public.board_ai_context_as(_meeting,_target,_actor);
    IF COALESCE((_context->'minutes'->>'current_version')::integer,0)<>_revision OR md5(_context::text)<>_context_hash THEN RAISE EXCEPTION 'contesto cambiato: rileggere i dati'; END IF;
    IF _s.draft_input_per_million_eur IS NULL OR _s.draft_output_per_million_eur IS NULL THEN RAISE EXCEPTION 'configurare le tariffe stimate della redazione'; END IF;
    _cost:=ceil((_units::numeric*_s.draft_input_per_million_eur+_s.draft_max_tokens::numeric*_s.draft_output_per_million_eur))/1000000;
  END IF;
  IF EXISTS (SELECT 1 FROM public.board_ai_jobs WHERE kind=_kind AND target_id=_target AND status IN ('reserved','running')) THEN RAISE EXCEPTION 'elaborazione già prenotata o in corso'; END IF;
  SELECT COALESCE(sum(reserved_cost),0) INTO _used FROM public.board_ai_jobs WHERE meeting_id=_meeting AND status<>'cancelled';
  IF _used+_cost>_s.max_cost_eur THEN RAISE EXCEPTION 'limite stimato complessivo della riunione superato'; END IF;
  INSERT INTO public.board_ai_jobs(request_id,meeting_id,kind,target_id,actor,units,expected_revision,reference_hash,reserved_cost,settings_snapshot)
    VALUES (_request,_meeting,_kind,_target,_actor,_units,_revision,_context_hash,_cost,to_jsonb(_s)) RETURNING * INTO _job;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,_actor,'ai_reserved',jsonb_build_object('job_id',_job.id,'kind',_kind,'estimated_cost',_cost::text));
  RETURN to_jsonb(_job)||jsonb_build_object('existing',false);
END $$;

CREATE OR REPLACE FUNCTION public.board_ai_job_begin(_job uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_ai_jobs; _context jsonb;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_ai_jobs WHERE id=_job) FOR UPDATE;
  SELECT * INTO _j FROM public.board_ai_jobs WHERE id=_job FOR UPDATE;
  IF _j.status IS DISTINCT FROM 'reserved' THEN RETURN false; END IF;
  IF NOT public.board_manager_as(_j.meeting_id,_j.actor) OR NOT EXISTS (SELECT 1 FROM public.board_ai_settings WHERE id=true AND enabled) THEN RAISE EXCEPTION 'autorizzazione o impostazioni cambiate'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_j.meeting_id AND status IN ('ESPORTATO','ARCHIVIATO')) THEN RAISE EXCEPTION 'seduta archiviata'; END IF;
  IF _j.kind='draft' THEN
    _context:=public.board_ai_context_as(_j.meeting_id,_j.target_id,_j.actor);
    IF md5(_context::text)<>_j.reference_hash THEN RAISE EXCEPTION 'contesto cambiato'; END IF;
  ELSE
    UPDATE public.board_audio_tracks SET status='in_trascrizione',transcript_error=NULL WHERE id=_j.target_id AND status IN ('caricata','errore');
    IF NOT FOUND THEN RAISE EXCEPTION 'traccia non più disponibile'; END IF;
  END IF;
  UPDATE public.board_ai_jobs SET status='running',started_at=now() WHERE id=_job;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.board_ai_job_fail(_job uuid,_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_ai_jobs;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_ai_jobs WHERE id=_job) FOR UPDATE;
  SELECT * INTO _j FROM public.board_ai_jobs WHERE id=_job FOR UPDATE;
  IF _j.status NOT IN ('reserved','running') THEN RETURN; END IF;
  UPDATE public.board_ai_jobs SET status=CASE WHEN _j.started_at IS NULL THEN 'cancelled' ELSE 'failed' END,error=left(_error,500),ended_at=now() WHERE id=_job;
  IF _j.kind='transcribe' THEN UPDATE public.board_audio_tracks SET status='errore',transcript_error=left(_error,500) WHERE id=_j.target_id; END IF;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_j.meeting_id,_j.actor,'ai_failed',jsonb_build_object('job_id',_job,'charged_estimate_retained',_j.started_at IS NOT NULL,'reason',left(_error,500)));
END $$;

CREATE OR REPLACE FUNCTION public.board_ai_job_complete(_job uuid,_transcript jsonb DEFAULT NULL,_body text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_ai_jobs; _n public.board_minutes; _context jsonb; _version integer;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_ai_jobs WHERE id=_job) FOR UPDATE;
  SELECT * INTO _j FROM public.board_ai_jobs WHERE id=_job FOR UPDATE;
  IF _j.status='succeeded' THEN RETURN; END IF;
  IF _j.status IS DISTINCT FROM 'running' THEN RAISE EXCEPTION 'elaborazione non attiva'; END IF;
  IF NOT public.board_manager_as(_j.meeting_id,_j.actor) THEN
    UPDATE public.board_ai_jobs SET status='failed',result=CASE WHEN _j.kind='draft' THEN left(_body,60000) END,error='Carica cambiata: risultato non applicato',ended_at=now() WHERE id=_job; RETURN;
  END IF;
  IF _j.kind='transcribe' THEN
    IF NOT EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE id=_j.target_id AND status='in_trascrizione') THEN RAISE EXCEPTION 'traccia non elaborabile'; END IF;
    PERFORM public.board_audio_track_update_service(_j.target_id,'trascritta',_transcript,NULL);
  ELSE
    IF COALESCE(length(trim(_body)),0) NOT BETWEEN 50 AND 60000 THEN RAISE EXCEPTION 'bozza vuota o troppo lunga'; END IF;
    SELECT * INTO _n FROM public.board_minutes WHERE id=_j.target_id FOR UPDATE;
    IF _n.current_version IS DISTINCT FROM _j.expected_revision OR _n.status NOT IN ('BOZZA','IN_REVISIONE') OR _n.signed_path IS NOT NULL THEN
      UPDATE public.board_ai_jobs SET status='failed',result=_body,error='Atto cambiato: bozza conservata ma non applicata',ended_at=now() WHERE id=_job; RETURN;
    END IF;
    _context:=public.board_ai_context_as(_j.meeting_id,_j.target_id,_j.actor);
    IF md5(_context::text)<>_j.reference_hash THEN
      UPDATE public.board_ai_jobs SET status='failed',result=_body,error='Dati cambiati: bozza conservata ma non applicata',ended_at=now() WHERE id=_job; RETURN;
    END IF;
    SELECT * INTO _n FROM public.board_minutes WHERE id=_j.target_id FOR UPDATE;
    _version:=_n.current_version+1;
    INSERT INTO public.board_minute_versions(minutes_id,version,body,content_hash,source,created_by) VALUES (_n.id,_version,_body,md5(_body),'ia',_j.actor);
    UPDATE public.board_minutes SET current_version=_version,updated_at=now() WHERE id=_n.id;
    INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_j.meeting_id,_j.actor,'minutes_version',jsonb_build_object('minutes_id',_n.id,'version',_version,'source','ia','job_id',_job));
  END IF;
  UPDATE public.board_ai_jobs SET status='succeeded',ended_at=now() WHERE id=_job;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_j.meeting_id,_j.actor,'ai_completed',jsonb_build_object('job_id',_job,'kind',_j.kind));
END $$;

CREATE OR REPLACE FUNCTION public.board_ai_usage(_meeting uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.board_can_view(_meeting) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN jsonb_build_object('reserved',(SELECT COALESCE(sum(reserved_cost),0)::text FROM public.board_ai_jobs WHERE meeting_id=_meeting AND status<>'cancelled'),'limit',(SELECT max_cost_eur::text FROM public.board_ai_settings WHERE id=true));
END $$;

CREATE OR REPLACE FUNCTION public.board_ai_settings_configure(_settings jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _input numeric; _output numeric; _tokens integer;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente'; END IF;
  _input:=NULLIF(_settings->>'draft_input_per_million_eur','')::numeric; _output:=NULLIF(_settings->>'draft_output_per_million_eur','')::numeric; _tokens:=COALESCE((_settings->>'draft_max_tokens')::integer,4000);
  IF _input<0 OR _output<0 OR _tokens NOT BETWEEN 256 AND 12000 THEN RAISE EXCEPTION 'tariffe o limite non validi'; END IF;
  PERFORM public.board_ai_settings_save((_settings->>'enabled')::boolean,_settings->>'provider',_settings->>'api_base',_settings->>'transcription_model',_settings->>'drafting_model',(_settings->>'cost_per_min_eur')::numeric,(_settings->>'max_cost_eur')::numeric,_settings->>'notice_version');
  UPDATE public.board_ai_settings SET draft_input_per_million_eur=_input,draft_output_per_million_eur=_output,draft_max_tokens=_tokens WHERE id=true;
END $$;

REVOKE ALL ON FUNCTION public.board_manager_as(uuid,uuid),public.board_ai_context_as(uuid,uuid,uuid),public.board_ai_reserve(uuid,text,uuid,uuid,bigint,integer,text),public.board_ai_job_begin(uuid),public.board_ai_job_fail(uuid,text),public.board_ai_job_complete(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.board_manager_as(uuid,uuid),public.board_ai_context_as(uuid,uuid,uuid),public.board_ai_reserve(uuid,text,uuid,uuid,bigint,integer,text),public.board_ai_job_begin(uuid),public.board_ai_job_fail(uuid,text),public.board_ai_job_complete(uuid,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.board_guest_consent_set(uuid,uuid,boolean,text),public.board_audio_track_start_with_participants(uuid,text,uuid[],text),public.board_recording_lease(uuid),public.board_audio_track_abort(uuid,text),public.board_ai_context(uuid,uuid),public.board_ai_usage(uuid),public.board_ai_settings_configure(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.board_guest_consent_set(uuid,uuid,boolean,text),public.board_audio_track_start_with_participants(uuid,text,uuid[],text),public.board_recording_lease(uuid),public.board_audio_track_abort(uuid,text),public.board_ai_context(uuid,uuid),public.board_ai_usage(uuid),public.board_ai_settings_configure(jsonb) TO authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='board_ai_jobs') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.board_ai_jobs; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.board_audio_track_finish(_track uuid, _storage_path text, _duration integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track) FOR UPDATE;
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id = _track;
  IF NOT FOUND THEN RAISE EXCEPTION 'traccia non trovata'; END IF;
  IF _t.status='caricata' AND _t.storage_path=_storage_path AND _t.created_by=auth.uid() THEN RETURN; END IF;
  IF _t.status <> 'in_registrazione' THEN RAISE EXCEPTION 'la traccia è già stata chiusa'; END IF;
  IF _t.kind = 'individual' AND _t.created_by <> auth.uid()
     OR _t.kind = 'shared' AND NOT (public.board_is_chair((SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track)) OR public.board_is_minute_taker(_t.meeting_id)) THEN
    RAISE EXCEPTION 'non autorizzato a chiudere questa traccia';
  END IF;
  IF _storage_path IS NULL OR _storage_path <> _t.meeting_id::text || '/' || _t.id::text || '.webm' THEN
    RAISE EXCEPTION 'percorso del file non valido';
  END IF;
  IF _duration IS NULL OR _duration NOT BETWEEN 1 AND 21600 OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='board-audio' AND name=_storage_path) THEN RAISE EXCEPTION 'durata o file non validi'; END IF;
  UPDATE public.board_audio_tracks
     SET status = 'caricata', storage_path = _storage_path, ended_at = now(), duration_seconds = _duration
   WHERE id = _track;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_t.meeting_id, auth.uid(), 'audio_track_finish', jsonb_build_object('track_id', _track, 'duration_seconds', _duration));
END $$;
CREATE OR REPLACE FUNCTION public.board_dossier_prepare(_meeting uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.board_meetings; _n public.board_minutes; _snapshot text;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN RAISE EXCEPTION 'solo il Presidente o il verbalizzante'; END IF;
  IF _m.ended_at IS NULL OR _m.status NOT IN ('APPROVATO','VERBALE_IN_REVISIONE') THEN RAISE EXCEPTION 'chiudere la seduta prima di preparare il fascicolo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_minutes WHERE meeting_id=_meeting AND origin_minutes_id IS NULL AND current_version>0) THEN RAISE EXCEPTION 'manca il resoconto della seduta'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id=_meeting AND status='aperta') OR EXISTS (
    SELECT 1 FROM public.board_audio_tracks WHERE meeting_id=_meeting AND status IN ('in_registrazione','in_trascrizione')) THEN RAISE EXCEPTION 'completare registrazioni, elaborazioni e votazioni'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ai_jobs WHERE meeting_id=_meeting AND status IN ('reserved','running')) THEN RAISE EXCEPTION 'completare le elaborazioni IA prima di archiviare'; END IF;
  FOR _n IN SELECT * FROM public.board_minutes WHERE meeting_id=_meeting LOOP
    IF _n.status='IN_APPROVAZIONE' OR _n.signed_path IS NULL OR _n.signed_at IS NULL OR _n.signed_version IS DISTINCT FROM _n.current_version THEN RAISE EXCEPTION 'serve la copia firmata della versione corrente di ogni atto'; END IF;
    IF _n.status='APPROVATO' AND NOT EXISTS (SELECT 1 FROM public.board_ballots b JOIN public.board_minute_versions v ON v.id=b.minutes_version_id WHERE b.minutes_id=_n.id AND b.status='chiusa' AND b.result='approvata' AND v.version=_n.current_version) THEN RAISE EXCEPTION 'manca il voto di approvazione della versione corrente'; END IF;
    IF _n.status<>'APPROVATO' AND COALESCE(trim(_m.status_reason),'')='' THEN RAISE EXCEPTION 'manca il motivo della chiusura senza approvazione'; END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='board-documents' AND name=_n.signed_path) THEN RAISE EXCEPTION 'copia firmata non disponibile'; END IF;
    IF EXISTS (SELECT 1 FROM public.board_minute_rectifications WHERE minutes_id=_n.id AND status='nuova') THEN RAISE EXCEPTION 'valutare prima le rettifiche della seduta'; END IF;
  END LOOP;
  _snapshot:=public.board_dossier_snapshot(_meeting);
  RETURN jsonb_build_object('snapshot',_snapshot,'revision',md5(_snapshot),
    'signed_path',(SELECT signed_path FROM public.board_minutes WHERE meeting_id=_meeting AND origin_minutes_id IS NULL),
    'signatures',(SELECT jsonb_agg(jsonb_build_object('minutes_id',id,'path',signed_path) ORDER BY origin_minutes_id NULLS FIRST,id) FROM public.board_minutes WHERE meeting_id=_meeting));
END $$;
CREATE OR REPLACE FUNCTION public.board_ai_job_interrupt(_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_ai_jobs;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_ai_jobs WHERE id=_job) FOR UPDATE;
  SELECT * INTO _j FROM public.board_ai_jobs WHERE id=_job FOR UPDATE;
  IF NOT (public.board_is_chair(_j.meeting_id) OR public.board_is_minute_taker(_j.meeting_id)) OR _j.status NOT IN ('reserved','running') OR COALESCE(_j.started_at,_j.created_at)>now()-interval '10 minutes' THEN RAISE EXCEPTION 'richiesta non interrompibile'; END IF;
  UPDATE public.board_ai_jobs SET status=CASE WHEN started_at IS NULL THEN 'cancelled' ELSE 'failed' END,ended_at=now(),error='Richiesta interrotta esplicitamente dopo 10 minuti' WHERE id=_job;
  IF _j.kind='transcribe' THEN UPDATE public.board_audio_tracks SET status='errore',transcript_error='Richiesta interrotta' WHERE id=_j.target_id; END IF;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_j.meeting_id,auth.uid(),'ai_interrupted',jsonb_build_object('job_id',_job,'charged_estimate_retained',_j.started_at IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.board_ai_job_interrupt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.board_ai_job_interrupt(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
