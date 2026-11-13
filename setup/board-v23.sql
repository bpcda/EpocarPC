-- Consiglio: resoconti sottoscrivibili e rettifiche in una successiva seduta. Dopo v22.
BEGIN;
ALTER FUNCTION public.board_events_immutable() SET search_path=public;
ALTER TABLE public.board_minutes ADD COLUMN IF NOT EXISTS origin_minutes_id uuid REFERENCES public.board_minutes(id) ON DELETE RESTRICT;
ALTER TABLE public.board_minutes ADD COLUMN IF NOT EXISTS origin_version integer;
ALTER TABLE public.board_minutes DROP CONSTRAINT IF EXISTS board_minutes_meeting_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS board_minutes_base ON public.board_minutes(meeting_id) WHERE origin_minutes_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS board_minutes_correction_meeting ON public.board_minutes(meeting_id,origin_minutes_id) WHERE origin_minutes_id IS NOT NULL;

-- Le proposte successive non sono figli modificabili del fascicolo già archiviato.
CREATE TABLE IF NOT EXISTS public.board_minutes_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_minutes_id uuid NOT NULL REFERENCES public.board_minutes(id) ON DELETE RESTRICT,
  origin_version integer NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 60000),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'proposta' CHECK (status IN ('proposta','accolta','respinta')),
  document_id uuid UNIQUE REFERENCES public.board_minutes(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.board_correction_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  correction_id uuid NOT NULL REFERENCES public.board_minutes_corrections(id) ON DELETE RESTRICT,
  actor uuid NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_corrections_origin ON public.board_minutes_corrections(origin_minutes_id);
CREATE INDEX IF NOT EXISTS board_correction_events_proposal ON public.board_correction_events(correction_id);
CREATE INDEX IF NOT EXISTS board_minutes_origin ON public.board_minutes(origin_minutes_id) WHERE origin_minutes_id IS NOT NULL;
ALTER TABLE public.board_minutes_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_correction_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_minutes_corrections, public.board_correction_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.board_minutes_corrections, public.board_correction_events TO authenticated;
GRANT ALL ON public.board_minutes_corrections, public.board_correction_events TO service_role;
DROP POLICY IF EXISTS board_corrections_read ON public.board_minutes_corrections;
CREATE POLICY board_corrections_read ON public.board_minutes_corrections FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_minutes_meeting(origin_minutes_id)));
DROP POLICY IF EXISTS board_correction_events_read ON public.board_correction_events;
CREATE POLICY board_correction_events_read ON public.board_correction_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.board_minutes_corrections c WHERE c.id=correction_id));
DROP TRIGGER IF EXISTS board_correction_events_immutable ON public.board_correction_events;
CREATE TRIGGER board_correction_events_immutable BEFORE UPDATE OR DELETE ON public.board_correction_events
  FOR EACH ROW EXECUTE FUNCTION public.board_events_immutable();

CREATE OR REPLACE FUNCTION public.board_minutes_ensure(_meeting uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.board_meetings; _id uuid;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN RAISE EXCEPTION 'solo il Presidente o il verbalizzante'; END IF;
  SELECT id INTO _id FROM public.board_minutes WHERE meeting_id=_meeting AND origin_minutes_id IS NULL;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF _m.started_at IS NULL OR _m.status IN ('DRAFT','ANNULLATO','ESPORTATO','ARCHIVIATO') THEN RAISE EXCEPTION 'seduta non disponibile per il verbale'; END IF;
  INSERT INTO public.board_minutes(meeting_id,number,created_by) VALUES (_meeting,_m.meeting_number,auth.uid()) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.board_minutes_closed_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n public.board_minutes; _ended timestamptz;
BEGIN
  SELECT * INTO _n FROM public.board_minutes WHERE id=NEW.minutes_id;
  SELECT ended_at INTO _ended FROM public.board_meetings WHERE id=_n.meeting_id FOR UPDATE;
  IF _ended IS NOT NULL AND (_n.status='APPROVATO' OR _n.signed_path IS NOT NULL OR NEW.source='rettifica') THEN
    RAISE EXCEPTION 'atto chiuso: proporre una rettifica in una successiva seduta'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.board_minutes_signed(_minutes uuid,_storage_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n public.board_minutes; _m public.board_meetings;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=(SELECT meeting_id FROM public.board_minutes WHERE id=_minutes) FOR UPDATE;
  SELECT * INTO _n FROM public.board_minutes WHERE id=_minutes FOR UPDATE;
  IF _n.id IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
  IF NOT (public.board_is_chair(_m.id) OR public.board_is_minute_taker(_m.id)) THEN RAISE EXCEPTION 'solo il Presidente o il verbalizzante'; END IF;
  IF _n.current_version<1 OR NOT (_n.status='APPROVATO' OR (_m.ended_at IS NOT NULL AND _m.status='VERBALE_IN_REVISIONE' AND _n.status IN ('BOZZA','IN_REVISIONE'))) THEN
    RAISE EXCEPTION 'firmare un verbale approvato oppure il resoconto di una seduta chiusa'; END IF;
  IF _storage_path IS NULL OR _storage_path !~ ('^'||_m.id::text||'/verbale_firmato-[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$') THEN RAISE EXCEPTION 'percorso del file non valido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='board-documents' AND name=_storage_path) THEN RAISE EXCEPTION 'copia firmata assente'; END IF;
  IF _n.signed_path=_storage_path THEN RETURN; END IF;
  UPDATE public.board_minutes SET signed_path=_storage_path,signed_at=now(),updated_at=now() WHERE id=_minutes;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_m.id,auth.uid(),'minutes_signed',
    jsonb_build_object('minutes_id',_minutes,'version',_n.current_version,'approved',_n.status='APPROVATO','path',_storage_path,'previous_path',_n.signed_path));
END $$;

CREATE OR REPLACE FUNCTION public.board_correction_propose(_origin uuid,_body text,_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n public.board_minutes; _id uuid;
BEGIN
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _n FROM public.board_minutes WHERE id=_origin;
  IF _n.id IS NULL OR NOT public.board_can_view(_n.meeting_id) OR NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_n.meeting_id AND ended_at IS NOT NULL)
    OR _n.current_version<1 OR (_n.status<>'APPROVATO' AND _n.signed_path IS NULL) THEN RAISE EXCEPTION 'occorre un atto chiuso approvato o sottoscritto'; END IF;
  IF COALESCE(length(trim(_body)),0) NOT BETWEEN 1 AND 60000 OR COALESCE(length(trim(_reason)),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'testo completo e motivo obbligatori'; END IF;
  INSERT INTO public.board_minutes_corrections(origin_minutes_id,origin_version,author_id,body,reason)
    VALUES (_origin,_n.current_version,auth.uid(),trim(_body),trim(_reason)) RETURNING id INTO _id;
  INSERT INTO public.board_correction_events(correction_id,actor,action) VALUES (_id,auth.uid(),'proposta');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.board_correction_adopt(_correction uuid,_meeting uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _c public.board_minutes_corrections; _n public.board_minutes; _m public.board_meetings; _id uuid;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id=_meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN RAISE EXCEPTION 'solo il Presidente o il verbalizzante'; END IF;
  IF _m.started_at IS NULL OR _m.ended_at IS NOT NULL OR _m.status NOT IN ('IN_CORSO','SOSPESO') THEN RAISE EXCEPTION 'scegliere una successiva seduta aperta'; END IF;
  SELECT * INTO _c FROM public.board_minutes_corrections WHERE id=_correction FOR UPDATE;
  SELECT * INTO _n FROM public.board_minutes WHERE id=_c.origin_minutes_id;
  IF _c.id IS NULL OR NOT public.board_can_view(_n.meeting_id) THEN RAISE EXCEPTION 'proposta non disponibile'; END IF;
  IF _c.status='accolta' AND EXISTS (SELECT 1 FROM public.board_minutes WHERE id=_c.document_id AND meeting_id=_meeting) THEN RETURN _c.document_id; END IF;
  IF _c.status<>'proposta' OR _n.meeting_id=_meeting OR _n.current_version<>_c.origin_version THEN RAISE EXCEPTION 'proposta già trattata o versione originaria cambiata'; END IF;
  IF _m.started_at<(SELECT ended_at FROM public.board_meetings WHERE id=_n.meeting_id) THEN RAISE EXCEPTION 'la rettifica richiede una seduta successiva alla chiusura originaria'; END IF;
  INSERT INTO public.board_minutes(meeting_id,number,created_by,origin_minutes_id,origin_version,current_version,status)
    VALUES (_meeting,_m.meeting_number,auth.uid(),_n.id,_c.origin_version,1,'IN_REVISIONE') RETURNING id INTO _id;
  INSERT INTO public.board_minute_versions(minutes_id,version,body,content_hash,source,created_by)
    VALUES (_id,1,_c.body,md5(_c.body),'rettifica',auth.uid());
  UPDATE public.board_minutes_corrections SET status='accolta',document_id=_id WHERE id=_correction;
  INSERT INTO public.board_correction_events(correction_id,actor,action,detail) VALUES (_correction,auth.uid(),'presa_in_carico',jsonb_build_object('meeting_id',_meeting,'document_id',_id));
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,auth.uid(),'correction_adopted',
    jsonb_build_object('origin_minutes_id',_n.id,'origin_version',_c.origin_version,'minutes_id',_id,'reason',_c.reason));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.board_correction_reject(_correction uuid,_meeting uuid,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=_meeting AND ended_at IS NULL AND status IN ('IN_CORSO','SOSPESO') FOR UPDATE;
  IF NOT FOUND OR NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN RAISE EXCEPTION 'seduta o autorizzazione non valida'; END IF;
  IF COALESCE(length(trim(_reason)),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'motivo obbligatorio'; END IF;
  UPDATE public.board_minutes_corrections SET status='respinta' WHERE id=_correction AND status='proposta';
  IF NOT FOUND THEN RAISE EXCEPTION 'proposta non disponibile'; END IF;
  INSERT INTO public.board_correction_events(correction_id,actor,action,detail) VALUES (_correction,auth.uid(),'respinta',jsonb_build_object('meeting_id',_meeting,'reason',trim(_reason)));
END $$;

CREATE OR REPLACE FUNCTION public.board_minutes_save_document(_minutes uuid, _body text, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _meeting uuid; _mn public.board_minutes; _ver int; _vid uuid; _hash text;
BEGIN
  SELECT meeting_id INTO _meeting FROM public.board_minutes WHERE id=_minutes;
  IF _meeting IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _source NOT IN ('ia','manuale','rettifica') THEN RAISE EXCEPTION 'origine della versione non valida'; END IF;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono scrivere il verbale'; END IF;
  IF COALESCE(length(trim(_body)),0) < 1 THEN RAISE EXCEPTION 'il testo del verbale è obbligatorio'; END IF;
  IF length(_body) > 60000 THEN RAISE EXCEPTION 'il testo del verbale è troppo lungo'; END IF;
  _mn := NULL; SELECT * INTO _mn FROM public.board_minutes WHERE id = _minutes FOR UPDATE;
  IF _mn.status = 'IN_APPROVAZIONE' THEN RAISE EXCEPTION 'verbale in approvazione: il testo è bloccato'; END IF;
  IF _mn.status = 'APPROVATO' AND _source <> 'rettifica' THEN
    RAISE EXCEPTION 'il verbale approvato si modifica solo con una versione rettificata'; END IF;
  IF _mn.signed_path IS NOT NULL AND EXISTS (SELECT 1 FROM public.board_meetings WHERE id=_meeting AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'atto sottoscritto: proporre una rettifica in una nuova seduta'; END IF;
  _hash := md5(_body);
  IF EXISTS (SELECT 1 FROM public.board_minute_versions
             WHERE minutes_id = _mn.id AND version = _mn.current_version AND content_hash = _hash) THEN
    RETURN _mn.id; -- nessuna modifica: nessuna nuova versione
  END IF;
  _ver := _mn.current_version + 1;
  INSERT INTO public.board_minute_versions(minutes_id, version, body, content_hash, source, created_by)
    VALUES (_mn.id, _ver, _body, _hash, _source, auth.uid()) RETURNING id INTO _vid;
  UPDATE public.board_minutes SET current_version = _ver,
    status = CASE WHEN status = 'APPROVATO' THEN 'IN_REVISIONE' ELSE status END, updated_at = now()
   WHERE id = _mn.id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_meeting, auth.uid(), 'minutes_version',
      jsonb_build_object('minutes_id', _mn.id, 'version', _ver, 'source', _source, 'hash', _hash));
  RETURN _mn.id;
END $$;
CREATE OR REPLACE FUNCTION public.board_minutes_save(_meeting uuid,_body text,_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.board_minutes_save_document(public.board_minutes_ensure(_meeting),_body,_source); END $$;
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
      RAISE EXCEPTION 'indica il motivo della chiusura senza approvazione del verbale'; END IF;
    _next := CASE WHEN _approved THEN 'APPROVATO' ELSE 'VERBALE_IN_REVISIONE' END;
    UPDATE public.board_meetings SET ended_at = now(), active_agenda_id = NULL WHERE id = _id;
    UPDATE public.board_agenda_items SET discussion_status = 'discussed' WHERE meeting_id = _id AND discussion_status = 'current';
  ELSE RAISE EXCEPTION 'azione non consentita nello stato corrente'; END IF;
  UPDATE public.board_meetings SET status = _next, status_reason = NULLIF(trim(_reason),''), updated_at = now() WHERE id = _id;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail)
    VALUES (_id,auth.uid(),'session_'||_action,jsonb_build_object('from',_m.status,'to',_next,'reason',_reason,'quorum',public.board_quorum(_id)));
END $$;
CREATE OR REPLACE FUNCTION public.board_dossier_snapshot(_meeting uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _snapshot jsonb;
BEGIN
  IF NOT public.board_can_view(_meeting) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'schema_version', 1, 'meeting', to_jsonb(m),
    'conflicts', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.deliberation_id,c.participant_id) FROM public.board_deliberation_conflicts c JOIN public.board_deliberations d ON d.id=c.deliberation_id WHERE d.meeting_id=m.id),'[]'::jsonb),
    'participants', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'last_seen_at' ORDER BY p.id)
      FROM public.board_meeting_participants p WHERE p.meeting_id = m.id), '[]'::jsonb),
    'agenda', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.position, a.id)
      FROM public.board_agenda_items a WHERE a.meeting_id = m.id), '[]'::jsonb),
    'deliberations', COALESCE((SELECT jsonb_agg(to_jsonb(d) || jsonb_build_object(
      'versions', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version) FROM public.board_deliberation_versions v WHERE v.deliberation_id = d.id), '[]'::jsonb),
      'suggestions', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at, s.id) FROM public.board_deliberation_suggestions s WHERE s.deliberation_id = d.id), '[]'::jsonb),
      'documents', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.board_deliberation_documents f WHERE f.deliberation_id = d.id), '[]'::jsonb)
    ) ORDER BY d.number) FROM public.board_deliberations d WHERE d.meeting_id = m.id), '[]'::jsonb),
    'minutes', (SELECT to_jsonb(n) || jsonb_build_object(
      'versions', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version) FROM public.board_minute_versions v WHERE v.minutes_id = n.id), '[]'::jsonb),
      'rectifications', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at, r.id) FROM public.board_minute_rectifications r WHERE r.minutes_id = n.id), '[]'::jsonb)
    ) FROM public.board_minutes n WHERE n.meeting_id = m.id AND n.origin_minutes_id IS NULL),
    'corrected_minutes', COALESCE((SELECT jsonb_agg(to_jsonb(n)||jsonb_build_object('versions',COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version) FROM public.board_minute_versions v WHERE v.minutes_id=n.id),'[]'::jsonb)) ORDER BY n.id) FROM public.board_minutes n WHERE n.meeting_id=m.id AND n.origin_minutes_id IS NOT NULL),'[]'::jsonb),
    'ballots', COALESCE((SELECT jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'votes', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.recorded_at, v.id) FROM public.board_votes v WHERE v.ballot_id = b.id), '[]'::jsonb)
    ) ORDER BY b.opened_at, b.id) FROM public.board_ballots b WHERE b.meeting_id = m.id), '[]'::jsonb),
    'recording_consents', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.board_recording_consents c WHERE c.meeting_id = m.id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.board_meeting_events e
      WHERE e.meeting_id = m.id AND e.action NOT LIKE 'dossier_%'), '[]'::jsonb)
  ) INTO _snapshot FROM public.board_meetings m WHERE m.id = _meeting;
  IF _snapshot IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  RETURN _snapshot::text;
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
REVOKE ALL ON FUNCTION public.board_minutes_save_document(uuid,text,text),public.board_correction_propose(uuid,text,text),public.board_correction_adopt(uuid,uuid),public.board_correction_reject(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.board_minutes_save_document(uuid,text,text),public.board_correction_propose(uuid,text,text),public.board_correction_adopt(uuid,uuid),public.board_correction_reject(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.board_minutes_closed_guard() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE _t text; BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  FOREACH _t IN ARRAY ARRAY['board_minutes_corrections','board_correction_events'] LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=_t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',_t); END IF;
  END LOOP;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
