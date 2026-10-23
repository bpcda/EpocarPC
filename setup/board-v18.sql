-- Epocar: Consiglio Direttivo — Fase 4 (registrazione audio con consenso, trascrizione IA).
-- rev. 1. Da eseguire nell'SQL Editor del progetto esterno, DOPO board-v15.sql, board-v16.sql e board-v17.sql. Rieseguibile.
-- Regole: nessuna registrazione senza consenso esplicito registrato a registro; il mancato consenso non esclude dalla riunione;
-- le tracce individuali sono associate al partecipante identificato; la traccia condivisa è caricata solo da Presidente/verbalizzante;
-- le trascrizioni sono scritte solo dal servizio (Edge Function), mai dal browser; l'attribuzione incerta resta segnalata.
BEGIN;

-- Consensi alla registrazione: registro append-only; il consenso corrente è l'ultima riga per partecipante.
CREATE TABLE IF NOT EXISTS public.board_recording_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.board_meeting_participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  consented boolean NOT NULL,
  notice_version text NOT NULL CHECK (length(notice_version) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_recording_consents_meeting ON public.board_recording_consents(meeting_id, participant_id, id DESC);

-- Tracce audio della seduta.
CREATE TABLE IF NOT EXISTS public.board_audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.board_meeting_participants(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('individual','shared')),
  status text NOT NULL DEFAULT 'in_registrazione'
    CHECK (status IN ('in_registrazione','caricata','in_trascrizione','trascritta','errore')),
  storage_path text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 21600),
  transcript jsonb,
  transcript_error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_audio_tracks_meeting ON public.board_audio_tracks(meeting_id);

-- Impostazioni IA (riga singola): nessuna chiave qui, le chiavi restano nei segreti della Edge Function.
CREATE TABLE IF NOT EXISTS public.board_ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'openai' CHECK (length(provider) BETWEEN 1 AND 60),
  api_base text NOT NULL DEFAULT 'https://api.openai.com/v1' CHECK (api_base ~ '^https://'),
  transcription_model text NOT NULL DEFAULT 'whisper-1' CHECK (length(transcription_model) BETWEEN 1 AND 120),
  cost_per_min_eur numeric(10,4) NOT NULL DEFAULT 0.0060 CHECK (cost_per_min_eur >= 0),
  max_cost_eur numeric(10,2) NOT NULL DEFAULT 5.00 CHECK (max_cost_eur >= 0),
  notice_version text NOT NULL DEFAULT 'v1' CHECK (length(notice_version) BETWEEN 1 AND 40),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.board_ai_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Consenso corrente del chiamante per una riunione.
CREATE OR REPLACE FUNCTION public.board_recording_consent_current(_meeting uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT c.consented FROM public.board_recording_consents c
    JOIN public.board_meeting_participants p ON p.id = c.participant_id
    WHERE c.meeting_id = _meeting AND p.user_id = auth.uid()
    ORDER BY c.id DESC LIMIT 1), false)
$$;

-- Registra o revoca il consenso del chiamante (solo componente convocato, riunione non archiviata).
CREATE OR REPLACE FUNCTION public.board_recording_consent_set(_meeting uuid, _consented boolean, _notice_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.board_meeting_participants;
BEGIN
  SELECT * INTO _p FROM public.board_meeting_participants
   WHERE meeting_id = _meeting AND user_id = auth.uid() AND kind = 'member';
  IF NOT FOUND THEN RAISE EXCEPTION 'non sei un componente convocato a questa riunione'; END IF;
  IF _notice_version IS NULL OR length(trim(_notice_version)) < 1 OR length(_notice_version) > 40 THEN
    RAISE EXCEPTION 'versione informativa non valida';
  END IF;
  INSERT INTO public.board_recording_consents(meeting_id, participant_id, user_id, consented, notice_version)
  VALUES (_meeting, _p.id, auth.uid(), _consented, trim(_notice_version));
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_meeting, auth.uid(), 'recording_consent',
    jsonb_build_object('name', _p.display_name, 'consented', _consented, 'notice_version', trim(_notice_version)));
END $$;

-- Apre una traccia: individuale (richiede consenso corrente, seduta in corso) o condivisa (Presidente/verbalizzante).
CREATE OR REPLACE FUNCTION public.board_audio_track_start(_meeting uuid, _kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _p public.board_meeting_participants; _id uuid;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id = _meeting;
  IF NOT FOUND THEN RAISE EXCEPTION 'riunione non trovata'; END IF;
  IF _kind NOT IN ('individual','shared') THEN RAISE EXCEPTION 'tipo di traccia non valido'; END IF;
  IF _m.started_at IS NULL OR _m.status IN ('ANNULLATO','ARCHIVIATO','ESPORTATO') THEN
    RAISE EXCEPTION 'la registrazione è possibile solo per una seduta avviata';
  END IF;
  IF _kind = 'individual' THEN
    IF _m.status <> 'IN_CORSO' THEN RAISE EXCEPTION 'la seduta non è in corso'; END IF;
    SELECT * INTO _p FROM public.board_meeting_participants
     WHERE meeting_id = _meeting AND user_id = auth.uid() AND kind = 'member';
    IF NOT FOUND THEN RAISE EXCEPTION 'non sei un componente convocato a questa riunione'; END IF;
    IF NOT _p.present THEN RAISE EXCEPTION 'la presenza non è stata verificata'; END IF;
    IF NOT public.board_recording_consent_current(_meeting) THEN
      RAISE EXCEPTION 'serve il consenso alla registrazione prima di iniziare';
    END IF;
    INSERT INTO public.board_audio_tracks(meeting_id, participant_id, kind, created_by)
    VALUES (_meeting, _p.id, 'individual', auth.uid()) RETURNING id INTO _id;
  ELSE
    IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_meeting)) THEN
      RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono caricare la traccia condivisa';
    END IF;
    INSERT INTO public.board_audio_tracks(meeting_id, kind, created_by)
    VALUES (_meeting, 'shared', auth.uid()) RETURNING id INTO _id;
  END IF;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_meeting, auth.uid(), 'audio_track_start', jsonb_build_object('track_id', _id, 'kind', _kind));
  RETURN _id;
END $$;

-- Chiude una traccia collegando il file caricato nello storage (percorso vincolato alla riunione e alla traccia).
CREATE OR REPLACE FUNCTION public.board_audio_track_finish(_track uuid, _storage_path text, _duration integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks;
BEGIN
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id = _track;
  IF NOT FOUND THEN RAISE EXCEPTION 'traccia non trovata'; END IF;
  IF _t.status <> 'in_registrazione' THEN RAISE EXCEPTION 'la traccia è già stata chiusa'; END IF;
  IF _t.kind = 'individual' AND _t.created_by <> auth.uid()
     OR _t.kind = 'shared' AND NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_t.meeting_id)) THEN
    RAISE EXCEPTION 'non autorizzato a chiudere questa traccia';
  END IF;
  IF _storage_path IS NULL OR _storage_path <> _t.meeting_id::text || '/' || _t.id::text || '.webm' THEN
    RAISE EXCEPTION 'percorso del file non valido';
  END IF;
  UPDATE public.board_audio_tracks
     SET status = 'caricata', storage_path = _storage_path, ended_at = now(), duration_seconds = _duration
   WHERE id = _track;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_t.meeting_id, auth.uid(), 'audio_track_finish', jsonb_build_object('track_id', _track, 'duration_seconds', _duration));
END $$;

-- Elimina una traccia non ancora trascritta (solo Presidente/verbalizzante; il file va rimosso dallo storage).
CREATE OR REPLACE FUNCTION public.board_audio_track_delete(_track uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks;
BEGIN
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id = _track;
  IF NOT FOUND THEN RAISE EXCEPTION 'traccia non trovata'; END IF;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_t.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono eliminare una traccia';
  END IF;
  IF _t.status IN ('in_trascrizione','trascritta') THEN
    RAISE EXCEPTION 'una traccia trascritta o in trascrizione non può essere eliminata: resta a registro';
  END IF;
  DELETE FROM public.board_audio_tracks WHERE id = _track;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_t.meeting_id, auth.uid(), 'audio_track_delete', jsonb_build_object('track_id', _track));
END $$;

-- Aggiornamento di stato e trascrizione: SOLO servizio (Edge Function con chiave service_role).
CREATE OR REPLACE FUNCTION public.board_audio_track_update_service(_track uuid, _status text, _transcript jsonb DEFAULT NULL, _error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks; _seg jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'riservato al servizio di trascrizione'; END IF;
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id = _track;
  IF NOT FOUND THEN RAISE EXCEPTION 'traccia non trovata'; END IF;
  IF _status NOT IN ('in_trascrizione','trascritta','errore') THEN RAISE EXCEPTION 'stato non valido'; END IF;
  IF _status = 'trascritta' THEN
    IF _transcript IS NULL OR jsonb_typeof(_transcript) <> 'array' OR jsonb_array_length(_transcript) = 0 THEN
      RAISE EXCEPTION 'trascrizione mancante o non valida';
    END IF;
    FOR _seg IN SELECT * FROM jsonb_array_elements(_transcript) LOOP
      IF jsonb_typeof(_seg) <> 'object'
         OR jsonb_typeof(_seg->'text') <> 'string' OR length(_seg->>'text') < 1
         OR jsonb_typeof(_seg->'start') <> 'number' OR jsonb_typeof(_seg->'end') <> 'number'
         OR COALESCE(_seg->>'attribution','') NOT IN ('verificata','incerta','non_attribuita') THEN
        RAISE EXCEPTION 'segmento di trascrizione non valido';
      END IF;
    END LOOP;
  END IF;
  UPDATE public.board_audio_tracks
     SET status = _status,
         transcript = CASE WHEN _status = 'trascritta' THEN _transcript ELSE transcript END,
         transcript_error = CASE WHEN _status = 'errore' THEN left(COALESCE(_error,'errore sconosciuto'), 500) ELSE NULL END
   WHERE id = _track;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_t.meeting_id, NULL, CASE WHEN _status = 'errore' THEN 'audio_error' ELSE 'audio_transcribed' END,
    jsonb_build_object('track_id', _track, 'status', _status));
END $$;

-- Impostazioni IA: lettura per chi può vedere le riunioni, scrittura solo Presidente.
CREATE OR REPLACE FUNCTION public.board_ai_settings_save(_enabled boolean, _provider text, _api_base text,
  _transcription_model text, _cost_per_min_eur numeric, _max_cost_eur numeric, _notice_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può configurare la trascrizione'; END IF;
  IF _api_base !~ '^https://' THEN RAISE EXCEPTION 'l''indirizzo del servizio IA deve essere https'; END IF;
  IF _max_cost_eur < 0 OR _cost_per_min_eur < 0 THEN RAISE EXCEPTION 'i limiti di spesa non possono essere negativi'; END IF;
  IF _notice_version IS NULL OR length(trim(_notice_version)) < 1 OR length(_notice_version) > 40 THEN
    RAISE EXCEPTION 'versione informativa non valida';
  END IF;
  UPDATE public.board_ai_settings SET enabled = _enabled, provider = trim(_provider), api_base = trim(_api_base),
    transcription_model = trim(_transcription_model), cost_per_min_eur = _cost_per_min_eur,
    max_cost_eur = _max_cost_eur, notice_version = trim(_notice_version), updated_by = auth.uid(), updated_at = now()
   WHERE id = true;
END $$;

ALTER TABLE public.board_recording_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_consents_read ON public.board_recording_consents;
CREATE POLICY board_consents_read ON public.board_recording_consents FOR SELECT TO authenticated
  USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_tracks_read ON public.board_audio_tracks;
CREATE POLICY board_tracks_read ON public.board_audio_tracks FOR SELECT TO authenticated
  USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_ai_settings_read ON public.board_ai_settings;
CREATE POLICY board_ai_settings_read ON public.board_ai_settings FOR SELECT TO authenticated
  USING (public.is_board_member(auth.uid()) OR public.is_board_president(auth.uid()));

GRANT SELECT ON public.board_recording_consents, public.board_audio_tracks, public.board_ai_settings TO authenticated;
GRANT ALL ON public.board_recording_consents, public.board_audio_tracks, public.board_ai_settings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.board_recording_consents_id_seq TO service_role;

-- Bucket privato per l'audio della seduta: accesso solo a chi può vedere la riunione (primo segmento del percorso = meeting_id).
INSERT INTO storage.buckets (id, name, public) VALUES ('board-audio', 'board-audio', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS board_audio_read ON storage.objects;
CREATE POLICY board_audio_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'board-audio' AND public.board_can_view((storage.foldername(name))[1]::uuid));
DROP POLICY IF EXISTS board_audio_write ON storage.objects;
CREATE POLICY board_audio_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-audio' AND public.board_can_view((storage.foldername(name))[1]::uuid));
DROP POLICY IF EXISTS board_audio_remove ON storage.objects;
CREATE POLICY board_audio_remove ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'board-audio' AND public.board_can_view((storage.foldername(name))[1]::uuid));

-- Realtime: tracce e consensi, protetti da RLS come le altre tabelle del modulo.
DO $$ DECLARE _table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH _table IN ARRAY ARRAY['board_audio_tracks','board_recording_consents'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _table) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',_table);
      END IF;
    END LOOP;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.board_recording_consent_current(uuid), public.board_recording_consent_set(uuid,boolean,text),
  public.board_audio_track_start(uuid,text), public.board_audio_track_finish(uuid,text,integer),
  public.board_audio_track_delete(uuid), public.board_audio_track_update_service(uuid,text,jsonb,text),
  public.board_ai_settings_save(boolean,text,text,text,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_recording_consent_current(uuid), public.board_recording_consent_set(uuid,boolean,text),
  public.board_audio_track_start(uuid,text), public.board_audio_track_finish(uuid,text,integer),
  public.board_audio_track_delete(uuid),
  public.board_ai_settings_save(boolean,text,text,text,numeric,numeric,text) TO authenticated;
-- board_audio_track_update_service: nessun GRANT ad authenticated; solo service_role (default di proprietà) la esegue.
GRANT EXECUTE ON FUNCTION public.board_audio_track_update_service(uuid,text,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
