-- Coda privata per la routine personale Codex. Dopo v27. Nessuna chiave di servizio al worker.
BEGIN;
UPDATE public.board_ai_settings SET notice_version='v2-codex' WHERE id=true AND notice_version='v1';
CREATE TABLE IF NOT EXISTS public.board_document_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
  last_seen_at timestamptz, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.board_document_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE RESTRICT,
  minutes_id uuid NOT NULL REFERENCES public.board_minutes(id) ON DELETE RESTRICT,
  actor uuid NOT NULL, worker_id uuid NOT NULL REFERENCES public.board_document_workers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','transcribing','drafting','ready','failed','stale','cancelled')),
  source_hash text NOT NULL, draft_hash text, expected_revision integer NOT NULL, context jsonb NOT NULL, tracks jsonb NOT NULL,
  coverage_note text NOT NULL CHECK (length(trim(coverage_note)) BETWEEN 5 AND 2000),
  lease_id uuid, lease_until timestamptz, result text, review_notes jsonb NOT NULL DEFAULT '[]', error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS board_document_jobs_active ON public.board_document_jobs(meeting_id) WHERE status IN ('pending','transcribing','drafting');
CREATE INDEX IF NOT EXISTS board_document_jobs_worker ON public.board_document_jobs(worker_id,created_at) WHERE status IN ('pending','transcribing','drafting');
ALTER TABLE public.board_document_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_document_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_document_workers,public.board_document_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.board_document_jobs TO authenticated;
GRANT ALL ON public.board_document_workers,public.board_document_jobs TO service_role;
DROP POLICY IF EXISTS board_document_jobs_read ON public.board_document_jobs;
CREATE POLICY board_document_jobs_read ON public.board_document_jobs FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));

CREATE OR REPLACE FUNCTION public.board_document_worker_register(_meeting uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _token text;
BEGIN
  IF NOT public.board_manager_as(_meeting,auth.uid()) THEN RAISE EXCEPTION 'solo chi presiede o verbalizza'; END IF;
  _token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.board_document_workers(actor,token_hash) VALUES (auth.uid(),encode(sha256(convert_to(_token,'UTF8')),'hex'))
    ON CONFLICT(actor) DO UPDATE SET token_hash=EXCLUDED.token_hash,enabled=true,expires_at=now()+interval '90 days',last_seen_at=NULL;
  RETURN _token;
END $$;
CREATE OR REPLACE FUNCTION public.board_document_worker_status(_meeting uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.board_can_view(_meeting) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT jsonb_build_object('paired',count(*)>0,'online',COALESCE(bool_or(last_seen_at>now()-interval '2 minutes'),false))
    FROM public.board_document_workers WHERE enabled AND expires_at>now() AND public.board_manager_as(_meeting,actor));
END $$;
CREATE OR REPLACE FUNCTION public.board_document_worker_revoke()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE public.board_document_workers SET enabled=false WHERE actor=auth.uid(); END $$;

CREATE OR REPLACE FUNCTION public.board_documents_request(_meeting uuid,_coverage_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.board_meetings; _n uuid; _c jsonb; _tracks jsonb; _id uuid; _worker uuid;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting FOR UPDATE;
  IF NOT public.board_manager_as(_meeting,auth.uid()) THEN RAISE EXCEPTION 'solo chi presiede o verbalizza'; END IF;
  IF COALESCE(length(trim(_coverage_note)),0) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'confermare copertura e parti da integrare'; END IF;
  SELECT id INTO _id FROM public.board_document_jobs WHERE meeting_id=_meeting AND status IN ('pending','transcribing','drafting');
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ai_jobs WHERE meeting_id=_meeting AND status IN ('reserved','running')) THEN RAISE EXCEPTION 'attendere le elaborazioni IA già avviate'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE meeting_id=_meeting AND (status IN ('in_registrazione','in_trascrizione') OR storage_path IS NULL)) THEN RAISE EXCEPTION 'terminare e caricare tutte le registrazioni prima di preparare i documenti'; END IF;
  SELECT id INTO _worker FROM public.board_document_workers WHERE enabled AND expires_at>now() AND public.board_manager_as(_meeting,actor) ORDER BY last_seen_at DESC NULLS LAST LIMIT 1;
  IF _worker IS NULL THEN RAISE EXCEPTION 'collegare prima il PC della routine'; END IF;
  _n:=public.board_minutes_ensure(_meeting);
  _c:=public.board_ai_context_as(_meeting,_n,auth.uid());
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'storage_path',storage_path,'duration_seconds',duration_seconds,
    'consent_snapshot',consent_snapshot,'transcript',transcript,'status',status) ORDER BY created_at,id),'[]') INTO _tracks FROM public.board_audio_tracks WHERE meeting_id=_meeting;
  IF jsonb_array_length(_tracks)=0 AND _coverage_note='Fonti audio disponibili verificate; rivedere attribuzioni e completezza prima delle firme.' THEN RAISE EXCEPTION 'senza audio inserire appunti o indicare le parti da integrare manualmente'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_tracks) t WHERE jsonb_array_length(t->'consent_snapshot')=0) THEN RAISE EXCEPTION 'consensi delle tracce non documentati'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_tracks) t, jsonb_array_elements(t->'consent_snapshot') s WHERE s->>'notice_version'<>'v2-codex') THEN RAISE EXCEPTION 'audio precedente all’informativa Codex: usare il percorso manuale o il servizio già autorizzato'; END IF;
  INSERT INTO public.board_document_jobs(meeting_id,minutes_id,actor,worker_id,source_hash,expected_revision,context,tracks,coverage_note)
    VALUES (_meeting,_n,auth.uid(),_worker,md5((_c-'transcripts')::text),COALESCE((_c->'minutes'->>'current_version')::integer,0),_c,_tracks,trim(_coverage_note)) RETURNING id INTO _id;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,auth.uid(),'documents_queued',jsonb_build_object('job_id',_id,'coverage_note',trim(_coverage_note)));
  RETURN _id;
END $$;

-- Solo la Edge Function risolve il token; il browser non può impersonare il worker.
CREATE OR REPLACE FUNCTION public.board_document_worker_auth(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'routine non autorizzata'; END IF;
  UPDATE public.board_document_workers SET last_seen_at=now() WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND enabled AND expires_at>now() RETURNING id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'routine non autorizzata'; END IF;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.board_documents_claim(_worker uuid,_job uuid DEFAULT NULL,_lease uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_document_jobs; _w public.board_document_workers;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  SELECT * INTO _w FROM public.board_document_workers WHERE id=_worker AND enabled AND expires_at>now();
  IF _w.id IS NULL THEN RAISE EXCEPTION 'routine non autorizzata'; END IF;
  SELECT * INTO _j FROM public.board_document_jobs WHERE worker_id=_worker
    AND ((_job IS NULL AND (status='pending' OR status IN ('transcribing','drafting') AND lease_until<now()))
      OR id=_job AND status IN ('transcribing','drafting') AND lease_id=_lease)
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF _j.id IS NULL THEN RETURN NULL; END IF;
  IF NOT public.board_manager_as(_j.meeting_id,_j.actor) OR NOT public.board_manager_as(_j.meeting_id,_w.actor) THEN
    UPDATE public.board_document_jobs SET status='cancelled',error='Autorizzazione cambiata',updated_at=now() WHERE id=_j.id; RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_j.tracks) t WHERE NOT EXISTS (
    SELECT 1 FROM public.board_audio_tracks a WHERE a.id=(t->>'id')::uuid AND a.storage_path=t->>'storage_path' AND a.consent_snapshot=t->'consent_snapshot'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(_j.tracks) t,jsonb_array_elements(t->'consent_snapshot') s WHERE EXISTS (
      SELECT 1 FROM public.board_recording_consents c WHERE c.participant_id=(s->>'participant_id')::uuid AND c.id>(s->>'consent_id')::bigint AND NOT c.consented)) THEN
    UPDATE public.board_document_jobs SET status='cancelled',error='Fonti o consensi cambiati',updated_at=now() WHERE id=_j.id; RETURN NULL;
  END IF;
  UPDATE public.board_document_jobs SET status=CASE WHEN status='pending' THEN 'transcribing' ELSE status END,
    lease_id=CASE WHEN _job IS NULL THEN gen_random_uuid() ELSE lease_id END,lease_until=now()+interval '2 minutes',updated_at=now()
    WHERE id=_j.id RETURNING * INTO _j;
  RETURN to_jsonb(_j);
END $$;

CREATE OR REPLACE FUNCTION public.board_documents_progress(_worker uuid,_job uuid,_lease uuid,_stage text,_track uuid DEFAULT NULL,_transcript jsonb DEFAULT NULL,_body text DEFAULT NULL,_notes jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_document_jobs; _w public.board_document_workers; _c jsonb; _n public.board_minutes; _t jsonb; _source jsonb;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_document_jobs WHERE id=_job) FOR UPDATE;
  SELECT * INTO _j FROM public.board_document_jobs WHERE id=_job AND worker_id=_worker AND lease_id=_lease FOR UPDATE;
  SELECT * INTO _w FROM public.board_document_workers WHERE id=_worker AND enabled AND expires_at>now();
  IF _j.id IS NULL OR _w.id IS NULL THEN RAISE EXCEPTION 'lavoro non disponibile'; END IF;
  IF _j.status IN ('ready','stale') AND _stage='complete' THEN RETURN jsonb_build_object('status',_j.status); END IF;
  IF _j.status NOT IN ('transcribing','drafting') OR _j.lease_until<now() THEN RAISE EXCEPTION 'presa in carico scaduta'; END IF;
  IF NOT public.board_manager_as(_j.meeting_id,_j.actor) OR NOT public.board_manager_as(_j.meeting_id,_w.actor) THEN RAISE EXCEPTION 'autorizzazione cambiata'; END IF;
  IF _stage='failed' THEN
    UPDATE public.board_document_jobs SET status='failed',error=left(COALESCE(_body,'Elaborazione interrotta'),500),updated_at=now() WHERE id=_job;
    RETURN jsonb_build_object('status','failed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.board_minutes WHERE id=_j.minutes_id AND (status NOT IN ('BOZZA','IN_REVISIONE') OR signed_path IS NOT NULL)) OR EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_j.meeting_id AND status IN ('ANNULLATO','ESPORTATO','ARCHIVIATO')) THEN
    UPDATE public.board_document_jobs SET status='stale',result=CASE WHEN _stage='complete' THEN left(_body,60000) END,error='Atto non modificabile: risultato conservato',updated_at=now() WHERE id=_job; RETURN jsonb_build_object('status','stale');
  END IF;
  _c:=public.board_ai_context_as(_j.meeting_id,_j.minutes_id,_j.actor);
  IF md5((_c-'transcripts')::text)<>_j.source_hash THEN
    UPDATE public.board_document_jobs SET status='stale',result=CASE WHEN _stage='complete' THEN left(_body,60000) END,error='Dati ufficiali cambiati: risultato non applicato',updated_at=now() WHERE id=_job;
    RETURN jsonb_build_object('status','stale');
  END IF;
  FOR _t IN SELECT * FROM jsonb_array_elements(_j.tracks) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE id=(_t->>'id')::uuid AND meeting_id=_j.meeting_id AND storage_path=_t->>'storage_path' AND consent_snapshot=_t->'consent_snapshot') THEN RAISE EXCEPTION 'fonte audio cambiata'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_t->'consent_snapshot') s WHERE NOT EXISTS (
      SELECT 1 FROM public.board_recording_consents c WHERE c.id=(s->>'consent_id')::bigint AND c.consented AND c.notice_version=s->>'notice_version') OR EXISTS (
      SELECT 1 FROM public.board_recording_consents c WHERE c.participant_id=(s->>'participant_id')::uuid AND c.id>(s->>'consent_id')::bigint AND NOT c.consented)) THEN RAISE EXCEPTION 'consenso non documentato o revocato'; END IF;
  END LOOP;
  IF _stage='transcript' THEN
    SELECT x INTO _source FROM jsonb_array_elements(_j.tracks) x WHERE x->>'id'=_track::text;
    IF _source IS NULL OR _transcript IS NULL OR jsonb_typeof(_transcript)<>'array' OR jsonb_array_length(_transcript) NOT BETWEEN 1 AND 20000 OR octet_length(_transcript::text)>2000000 THEN RAISE EXCEPTION 'traccia estranea al lavoro'; END IF;
    IF EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE id=_track AND status='trascritta') THEN RETURN jsonb_build_object('status',_j.status); END IF;
    IF _source->>'kind'='shared' AND EXISTS (SELECT 1 FROM jsonb_array_elements(_transcript) s WHERE s->>'speaker' IS NOT NULL OR s->>'attribution'<>'non_attribuita') THEN RAISE EXCEPTION 'attribuzione incerta per la traccia condivisa'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_transcript) s WHERE COALESCE(length(trim(s->>'text')),0) NOT BETWEEN 1 AND 20000 OR (s->>'start')::numeric<0 OR (s->>'end')::numeric<(s->>'start')::numeric OR (s->>'end')::numeric>COALESCE((_source->>'duration_seconds')::numeric,21600)+2) THEN RAISE EXCEPTION 'segmenti fuori dai limiti'; END IF;
    PERFORM public.board_audio_track_update_service(_track,'trascritta',_transcript,NULL);
  ELSIF _stage='drafting' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_j.tracks) s JOIN public.board_audio_tracks t ON t.id=(s->>'id')::uuid WHERE t.status<>'trascritta') THEN RAISE EXCEPTION 'trascrizioni incomplete'; END IF;
    _c:=public.board_ai_context_as(_j.meeting_id,_j.minutes_id,_j.actor);
    UPDATE public.board_document_jobs SET status='drafting',draft_hash=md5(_c::text) WHERE id=_job;
  ELSIF _stage='complete' THEN
    IF _j.draft_hash IS NULL OR md5(_c::text)<>_j.draft_hash THEN
      UPDATE public.board_document_jobs SET status='stale',result=left(_body,60000),error='Trascrizioni cambiate: bozza conservata ma non applicata',updated_at=now() WHERE id=_job; RETURN jsonb_build_object('status','stale');
    END IF;
    IF _j.status<>'drafting' OR COALESCE(length(trim(_body)),0) NOT BETWEEN 50 AND 60000 OR jsonb_typeof(_notes)<>'array' OR octet_length(_notes::text)>20000 THEN RAISE EXCEPTION 'bozza o note non valide'; END IF;
    SELECT * INTO _n FROM public.board_minutes WHERE id=_j.minutes_id FOR UPDATE;
    INSERT INTO public.board_minute_versions(minutes_id,version,body,content_hash,source,created_by) VALUES (_n.id,_n.current_version+1,trim(_body),md5(trim(_body)),'ia',_j.actor);
    UPDATE public.board_minutes SET current_version=current_version+1,updated_at=now() WHERE id=_n.id;
    UPDATE public.board_document_jobs SET status='ready',result=trim(_body),review_notes=_notes,updated_at=now() WHERE id=_job;
    INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_j.meeting_id,_j.actor,'documents_ready',jsonb_build_object('job_id',_job,'minutes_id',_n.id,'version',_n.current_version+1));
    RETURN jsonb_build_object('status','ready');
  ELSE RAISE EXCEPTION 'passaggio non valido'; END IF;
  UPDATE public.board_document_jobs SET lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=_job;
  RETURN jsonb_build_object('status',CASE WHEN _stage='drafting' THEN 'drafting' ELSE _j.status END,'context',_c);
END $$;

CREATE OR REPLACE FUNCTION public.board_documents_cancel(_job uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _j public.board_document_jobs;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_document_jobs WHERE id=_job) FOR UPDATE;
  SELECT * INTO _j FROM public.board_document_jobs WHERE id=_job FOR UPDATE;
  IF NOT public.board_manager_as(_j.meeting_id,auth.uid()) OR _j.status NOT IN ('pending','transcribing','drafting') THEN RAISE EXCEPTION 'lavoro non annullabile'; END IF;
  UPDATE public.board_document_jobs SET status='cancelled',error='Annullato esplicitamente',updated_at=now() WHERE id=_job;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_j.meeting_id,auth.uid(),'documents_cancelled',jsonb_build_object('job_id',_job));
END $$;

REVOKE ALL ON FUNCTION public.board_document_worker_register(uuid),public.board_document_worker_status(uuid),public.board_document_worker_revoke(),public.board_documents_request(uuid,text),public.board_documents_cancel(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.board_document_worker_register(uuid),public.board_document_worker_status(uuid),public.board_document_worker_revoke(),public.board_documents_request(uuid,text),public.board_documents_cancel(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.board_document_worker_auth(text),public.board_documents_claim(uuid,uuid,uuid),public.board_documents_progress(uuid,uuid,uuid,text,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.board_document_worker_auth(text),public.board_documents_claim(uuid,uuid,uuid),public.board_documents_progress(uuid,uuid,uuid,text,uuid,jsonb,text,jsonb) TO service_role;
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
  IF EXISTS (SELECT 1 FROM public.board_document_jobs WHERE meeting_id=_meeting AND status IN ('pending','transcribing','drafting')) THEN RAISE EXCEPTION 'routine documenti già in corso'; END IF;
  IF _kind='draft' AND EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE meeting_id=_meeting AND status<>'trascritta') THEN RAISE EXCEPTION 'completare tutte le trascrizioni prima della bozza'; END IF;
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
  IF EXISTS (SELECT 1 FROM public.board_document_jobs WHERE meeting_id=_meeting AND status IN ('pending','transcribing','drafting')) THEN RAISE EXCEPTION 'completare la routine documenti prima del fascicolo'; END IF;
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
NOTIFY pgrst,'reload schema';
COMMIT;
