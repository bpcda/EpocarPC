-- Consiglio Direttivo — Fase 6. Eseguire sul progetto esterno DOPO board-v15…v19.
-- Il fascicolo conserva gli atti; audio e trascrizioni restano temporanei e non entrano nello ZIP.
BEGIN;

-- Le copie firmate già presenti vanno riassociate esplicitamente alla versione corretta.
ALTER TABLE public.board_minutes ADD COLUMN IF NOT EXISTS signed_version integer;

CREATE TABLE IF NOT EXISTS public.board_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE RESTRICT,
  revision text NOT NULL,
  snapshot text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  archived_at timestamptz
);
ALTER TABLE public.board_dossiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_dossiers_read ON public.board_dossiers;
CREATE POLICY board_dossiers_read ON public.board_dossiers FOR SELECT TO authenticated
  USING (public.board_can_view(meeting_id));
REVOKE ALL ON public.board_dossiers FROM authenticated, anon;
GRANT SELECT ON public.board_dossiers TO authenticated;
GRANT ALL ON public.board_dossiers TO service_role;

CREATE OR REPLACE FUNCTION public.board_dossier_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'il fascicolo è immutabile'; END IF;
  IF (to_jsonb(NEW) - ARRAY['verified_at','archived_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['verified_at','archived_at']) THEN
    RAISE EXCEPTION 'il fascicolo è immutabile';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS board_dossiers_immutable ON public.board_dossiers;
CREATE TRIGGER board_dossiers_immutable BEFORE UPDATE OR DELETE ON public.board_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.board_dossier_immutable();

-- Un'unica lettura server, senza il limite di righe delle risposte REST e senza contenuti audio.
CREATE OR REPLACE FUNCTION public.board_dossier_snapshot(_meeting uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _snapshot jsonb;
BEGIN
  IF NOT public.board_can_view(_meeting) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'schema_version', 1, 'meeting', to_jsonb(m),
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
    ) FROM public.board_minutes n WHERE n.meeting_id = m.id),
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _mn public.board_minutes; _snapshot text;
BEGIN
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_meeting)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono preparare il fascicolo'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _m.id IS NULL OR _m.ended_at IS NULL OR _m.status NOT IN ('VERBALE_IN_REVISIONE','APPROVATO') THEN
    RAISE EXCEPTION 'chiudere la seduta prima di preparare il fascicolo'; END IF;
  SELECT * INTO _mn FROM public.board_minutes WHERE meeting_id = _meeting;
  IF _mn.id IS NULL OR _mn.status <> 'APPROVATO' OR _mn.signed_path IS NULL OR _mn.signed_at IS NULL THEN
    RAISE EXCEPTION 'servono il verbale approvato e la sua versione firmata'; END IF;
  IF _mn.signed_version IS DISTINCT FROM _mn.current_version THEN
    RAISE EXCEPTION 'registrare la copia firmata della versione corrente del verbale'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_ballots b JOIN public.board_minute_versions v ON v.id = b.minutes_version_id
    WHERE b.minutes_id = _mn.id AND b.status = 'chiusa' AND b.result = 'approvata' AND v.version = _mn.current_version) THEN
    RAISE EXCEPTION 'manca il voto di approvazione della versione corrente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'board-documents' AND name = _mn.signed_path) THEN
    RAISE EXCEPTION 'file del verbale firmato non disponibile'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id = _meeting AND status = 'aperta')
     OR EXISTS (SELECT 1 FROM public.board_audio_tracks WHERE meeting_id = _meeting AND status IN ('in_registrazione','in_trascrizione')) THEN
    RAISE EXCEPTION 'completare le registrazioni, trascrizioni e votazioni in corso'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_minute_rectifications WHERE minutes_id = _mn.id AND status = 'nuova') THEN
    RAISE EXCEPTION 'valutare prima le rettifiche al verbale'; END IF;
  _snapshot := public.board_dossier_snapshot(_meeting);
  RETURN jsonb_build_object('snapshot', _snapshot, 'revision', md5(_snapshot), 'signed_path', _mn.signed_path);
END $$;

CREATE OR REPLACE FUNCTION public.board_dossier_register(_meeting uuid, _revision text, _storage_path text, _sha256 text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prepared jsonb; _id uuid;
BEGIN
  _prepared := public.board_dossier_prepare(_meeting);
  IF _revision IS DISTINCT FROM _prepared->>'revision' THEN RAISE EXCEPTION 'la seduta è cambiata: rigenerare il fascicolo'; END IF;
  IF _storage_path IS NULL OR _storage_path !~ ('^' || _meeting::text || '/fascicolo-[0-9a-f-]{36}\.zip$') THEN
    RAISE EXCEPTION 'percorso del fascicolo non valido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'board-documents' AND name = _storage_path) THEN
    RAISE EXCEPTION 'file del fascicolo non disponibile'; END IF;
  INSERT INTO public.board_dossiers(meeting_id, revision, snapshot, storage_path, sha256, created_by)
    VALUES (_meeting, _revision, _prepared->>'snapshot', _storage_path, _sha256, auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_meeting, auth.uid(), 'dossier_created', jsonb_build_object('dossier_id', _id, 'sha256', _sha256));
  RETURN _id;
END $$;

-- Blocca gli atti mentre lo storage viene ripulito. Una richiesta interrotta si può ripetere.
CREATE OR REPLACE FUNCTION public.board_dossier_begin_archive(_dossier uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_dossiers; _m public.board_meetings; _prepared jsonb;
BEGIN
  SELECT * INTO _d FROM public.board_dossiers WHERE id = _dossier;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'fascicolo inesistente'; END IF;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_d.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono archiviare'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _d.meeting_id FOR UPDATE;
  SELECT * INTO _d FROM public.board_dossiers WHERE id = _dossier;
  IF _d.verified_at IS NOT NULL AND _m.status IN ('ESPORTATO','ARCHIVIATO') THEN RETURN; END IF;
  _prepared := public.board_dossier_prepare(_d.meeting_id);
  IF _d.revision IS DISTINCT FROM _prepared->>'revision' THEN RAISE EXCEPTION 'fascicolo superato: rigenerarlo prima di archiviare'; END IF;
  UPDATE public.board_dossiers SET verified_at = now() WHERE id = _dossier;
  UPDATE public.board_meetings SET status = 'ESPORTATO', updated_at = now() WHERE id = _d.meeting_id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'dossier_verified', jsonb_build_object('dossier_id', _dossier));
END $$;

CREATE OR REPLACE FUNCTION public.board_dossier_finish_archive(_dossier uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_dossiers; _m public.board_meetings; _count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'riservato al servizio di archiviazione'; END IF;
  SELECT * INTO _d FROM public.board_dossiers WHERE id = _dossier;
  IF _d.id IS NULL OR _d.verified_at IS NULL THEN RAISE EXCEPTION 'fascicolo non verificato'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _d.meeting_id FOR UPDATE;
  SELECT * INTO _d FROM public.board_dossiers WHERE id = _dossier;
  IF _m.status = 'ARCHIVIATO' AND _d.archived_at IS NOT NULL THEN RETURN; END IF;
  IF _m.status <> 'ESPORTATO' THEN RAISE EXCEPTION 'archiviazione non avviata'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'board-documents' AND name = _d.storage_path) THEN
    RAISE EXCEPTION 'fascicolo non disponibile'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'board-audio' AND name LIKE _d.meeting_id::text || '/%') THEN
    RAISE EXCEPTION 'eliminazione audio non ancora completata'; END IF;
  DELETE FROM public.board_audio_tracks WHERE meeting_id = _d.meeting_id;
  GET DIAGNOSTICS _count = ROW_COUNT;
  UPDATE public.board_meetings SET status = 'ARCHIVIATO', updated_at = now() WHERE id = _d.meeting_id;
  UPDATE public.board_dossiers SET archived_at = now() WHERE id = _dossier;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, NULL, 'dossier_archived', jsonb_build_object('dossier_id', _dossier, 'deleted_tracks', _count));
END $$;

-- Nessuna modifica degli atti dopo la verifica; i lock serializzano scritture ed esportazione.
CREATE OR REPLACE FUNCTION public.board_archive_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row jsonb; _meeting uuid; _status text;
BEGIN
  _row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 'board_meetings' THEN
    IF OLD.status IN ('ESPORTATO','ARCHIVIATO') AND NOT (
      OLD.status = 'ESPORTATO' AND NEW.status = 'ARCHIVIATO' AND COALESCE(auth.role(),'') = 'service_role'
      AND (to_jsonb(NEW) - ARRAY['status','updated_at']) = (to_jsonb(OLD) - ARRAY['status','updated_at'])) THEN
      RAISE EXCEPTION 'seduta archiviata o in archiviazione: atti bloccati'; END IF;
    RETURN NEW;
  END IF;
  _meeting := (_row->>'meeting_id')::uuid;
  IF _meeting IS NULL AND _row ? 'deliberation_id' THEN
    SELECT meeting_id INTO _meeting FROM public.board_deliberations WHERE id = (_row->>'deliberation_id')::uuid;
  ELSIF _meeting IS NULL AND _row ? 'minutes_id' THEN
    SELECT meeting_id INTO _meeting FROM public.board_minutes WHERE id = (_row->>'minutes_id')::uuid;
  ELSIF _meeting IS NULL AND _row ? 'ballot_id' THEN
    SELECT meeting_id INTO _meeting FROM public.board_ballots WHERE id = (_row->>'ballot_id')::uuid;
  END IF;
  SELECT status INTO _status FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _status IN ('ESPORTATO','ARCHIVIATO') AND NOT (TG_TABLE_NAME = 'board_audio_tracks' AND TG_OP = 'DELETE'
    AND _status = 'ESPORTATO' AND COALESCE(auth.role(),'') = 'service_role') THEN
    RAISE EXCEPTION 'seduta archiviata o in archiviazione: atti bloccati'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['board_meeting_participants','board_agenda_items','board_deliberations',
    'board_deliberation_versions','board_deliberation_suggestions','board_deliberation_documents',
    'board_ballots','board_votes','board_minutes','board_minute_versions','board_minute_rectifications',
    'board_recording_consents','board_audio_tracks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS board_archive_guard ON public.%I', _table);
    EXECUTE format('CREATE TRIGGER board_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.board_archive_guard()', _table);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS board_archive_guard ON public.board_meetings;
CREATE TRIGGER board_archive_guard BEFORE UPDATE ON public.board_meetings FOR EACH ROW EXECUTE FUNCTION public.board_archive_guard();

-- Una firma vale solo per la versione a cui è stata associata.
CREATE OR REPLACE FUNCTION public.board_minutes_signature_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.current_version <> OLD.current_version THEN
    NEW.signed_path := NULL; NEW.signed_at := NULL; NEW.signed_version := NULL;
  ELSIF NEW.signed_path IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'board-documents' AND name = NEW.signed_path) THEN
      RAISE EXCEPTION 'file del verbale firmato non disponibile'; END IF;
    NEW.signed_version := NEW.current_version;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS board_minutes_signature_guard ON public.board_minutes;
CREATE TRIGGER board_minutes_signature_guard BEFORE UPDATE OF current_version, signed_path, signed_at ON public.board_minutes
  FOR EACH ROW EXECUTE FUNCTION public.board_minutes_signature_guard();

-- Lo storage non può aggirare i permessi degli atti. I fascicoli sono scritti solo dalla Edge Function.
CREATE OR REPLACE FUNCTION public.board_document_writable(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.board_meetings m
    WHERE _path ~ ('^' || m.id::text || '/verbale_firmato-[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$')
      AND m.status NOT IN ('ESPORTATO','ARCHIVIATO')
      AND (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(m.id)))
$$;
DROP POLICY IF EXISTS board_documents_write ON storage.objects;
CREATE POLICY board_documents_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-documents' AND public.board_document_writable(name));
DROP POLICY IF EXISTS board_documents_remove ON storage.objects;
CREATE POLICY board_documents_remove ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'board-documents' AND public.board_document_writable(name)
    AND NOT EXISTS (SELECT 1 FROM public.board_minutes WHERE signed_path = name)
    AND NOT EXISTS (SELECT 1 FROM public.board_dossiers WHERE snapshot::jsonb->'minutes'->>'signed_path' = name));
CREATE OR REPLACE FUNCTION public.board_audio_writable(_path text, _remove boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _meeting uuid;
BEGIN
  SELECT t.meeting_id INTO _meeting FROM public.board_audio_tracks t
    WHERE _path = t.meeting_id::text || '/' || t.id::text || '.webm';
  IF _meeting IS NULL THEN RETURN false; END IF;
  -- Anche le richieste Storage già avviate devono terminare prima del blocco dell'archivio.
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  RETURN EXISTS (SELECT 1 FROM public.board_audio_tracks t JOIN public.board_meetings m ON m.id = t.meeting_id
    WHERE _path = m.id::text || '/' || t.id::text || '.webm' AND m.status NOT IN ('ESPORTATO','ARCHIVIATO') AND (
      (_remove AND t.status NOT IN ('trascritta','in_trascrizione') AND (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(m.id)))
      OR (NOT _remove AND t.status = 'in_registrazione' AND t.created_by = auth.uid())));
END
$$;
DROP POLICY IF EXISTS board_audio_write ON storage.objects;
CREATE POLICY board_audio_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-audio' AND public.board_audio_writable(name, false));
DROP POLICY IF EXISTS board_audio_remove ON storage.objects;
CREATE POLICY board_audio_remove ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'board-audio' AND public.board_audio_writable(name, true));

REVOKE ALL ON FUNCTION public.board_dossier_snapshot(uuid), public.board_dossier_prepare(uuid),
  public.board_dossier_register(uuid,text,text,text), public.board_dossier_begin_archive(uuid),
  public.board_document_writable(text), public.board_audio_writable(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_dossier_snapshot(uuid), public.board_dossier_prepare(uuid),
  public.board_dossier_register(uuid,text,text,text), public.board_dossier_begin_archive(uuid),
  public.board_document_writable(text), public.board_audio_writable(text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.board_dossier_finish_archive(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.board_dossier_finish_archive(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.board_dossier_immutable(), public.board_archive_guard(),
  public.board_minutes_signature_guard() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
