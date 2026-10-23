-- Epocar: Consiglio Direttivo — Fase 5 (verbale: bozza IA, revisione, approvazione col voto, versione firmata).
-- rev. 1. Da eseguire nell'SQL Editor del progetto esterno, DOPO board-v15.sql … board-v18.sql. Rieseguibile.
-- Regole: il verbale si scrive (a mano o via IA) solo da Presidente/verbalizzante; ogni componente propone rettifiche senza
-- editare il testo; il Presidente sottopone il verbale al voto (stesso sistema delle delibere: quorum, maggioranza semplice,
-- voto prevalente del Presidente solo in parità); il testo approvato è bloccato e ogni correzione successiva è una versione
-- rettificata identificabile che richiede una nuova approvazione. Il voto digitale non equivale alla firma: la versione
-- firmata si carica a parte.
BEGIN;

CREATE TABLE IF NOT EXISTS public.board_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  number integer,
  status text NOT NULL DEFAULT 'BOZZA' CHECK (status IN ('BOZZA','IN_REVISIONE','IN_APPROVAZIONE','APPROVATO')),
  current_version integer NOT NULL DEFAULT 0,
  signed_path text,
  signed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.board_minute_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id uuid NOT NULL REFERENCES public.board_minutes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 60000),
  content_hash text NOT NULL,
  source text NOT NULL DEFAULT 'manuale' CHECK (source IN ('ia','manuale','rettifica')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  UNIQUE (minutes_id, version)
);
CREATE TABLE IF NOT EXISTS public.board_minute_rectifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id uuid NOT NULL REFERENCES public.board_minutes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 5 AND 4000),
  status text NOT NULL DEFAULT 'nuova' CHECK (status IN ('nuova','accolta','non_accolta')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_by uuid,
  handled_at timestamptz
);

-- Il voto sul verbale riusa board_ballots: esattamente uno tra delibera e verbale.
ALTER TABLE public.board_ballots ALTER COLUMN deliberation_id DROP NOT NULL;
ALTER TABLE public.board_ballots ALTER COLUMN version_id DROP NOT NULL;
ALTER TABLE public.board_ballots ADD COLUMN IF NOT EXISTS minutes_id uuid REFERENCES public.board_minutes(id) ON DELETE CASCADE;
ALTER TABLE public.board_ballots ADD COLUMN IF NOT EXISTS minutes_version_id uuid REFERENCES public.board_minute_versions(id) ON DELETE RESTRICT;
ALTER TABLE public.board_ballots DROP CONSTRAINT IF EXISTS board_ballots_one_subject;
ALTER TABLE public.board_ballots ADD CONSTRAINT board_ballots_one_subject
  CHECK (num_nonnulls(deliberation_id, minutes_id) = 1);

-- Modello di redazione nelle impostazioni IA (la firma della funzione di salvataggio cambia: si sostituisce).
ALTER TABLE public.board_ai_settings ADD COLUMN IF NOT EXISTS drafting_model text NOT NULL DEFAULT 'gpt-4o-mini';
ALTER TABLE public.board_ai_settings DROP CONSTRAINT IF EXISTS board_ai_settings_drafting_model_len;
ALTER TABLE public.board_ai_settings ADD CONSTRAINT board_ai_settings_drafting_model_len CHECK (length(drafting_model) BETWEEN 1 AND 120);
DROP FUNCTION IF EXISTS public.board_ai_settings_save(boolean,text,text,text,numeric,numeric,text);
CREATE OR REPLACE FUNCTION public.board_ai_settings_save(_enabled boolean, _provider text, _api_base text,
  _transcription_model text, _drafting_model text, _cost_per_min_eur numeric, _max_cost_eur numeric, _notice_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può configurare la trascrizione'; END IF;
  IF _api_base !~ '^https://' THEN RAISE EXCEPTION 'l''indirizzo del servizio IA deve essere https'; END IF;
  IF _max_cost_eur < 0 OR _cost_per_min_eur < 0 THEN RAISE EXCEPTION 'i limiti di spesa non possono essere negativi'; END IF;
  IF _notice_version IS NULL OR length(trim(_notice_version)) < 1 OR length(_notice_version) > 40 THEN
    RAISE EXCEPTION 'versione informativa non valida';
  END IF;
  UPDATE public.board_ai_settings SET enabled = _enabled, provider = trim(_provider), api_base = trim(_api_base),
    transcription_model = trim(_transcription_model), drafting_model = trim(_drafting_model),
    cost_per_min_eur = _cost_per_min_eur, max_cost_eur = _max_cost_eur, notice_version = trim(_notice_version),
    updated_by = auth.uid(), updated_at = now()
   WHERE id = true;
END $$;

-- Meeting owner of a minutes record (for RLS on child tables).
CREATE OR REPLACE FUNCTION public.board_minutes_meeting(_minutes uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT meeting_id FROM public.board_minutes WHERE id = _minutes $$;

-- Crea il verbale della riunione (una sola volta; numero = numero della riunione).
CREATE OR REPLACE FUNCTION public.board_minutes_ensure(_meeting uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _id uuid;
BEGIN
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_meeting)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono predisporre il verbale'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _meeting;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  IF _m.started_at IS NULL OR _m.status IN ('DRAFT','ANNULLATO') THEN
    RAISE EXCEPTION 'il verbale si predispone per una seduta avviata'; END IF;
  INSERT INTO public.board_minutes(meeting_id, number, created_by)
  VALUES (_meeting, _m.meeting_number, auth.uid())
  ON CONFLICT (meeting_id) DO UPDATE SET meeting_id = EXCLUDED.meeting_id
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Scrive una nuova versione del verbale (manuale, IA o rettifica). Mai durante il voto; dopo l'approvazione
-- solo come 'rettifica', che riporta il verbale in revisione e richiede una nuova approvazione.
CREATE OR REPLACE FUNCTION public.board_minutes_save(_meeting uuid, _body text, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _ver int; _vid uuid; _hash text;
BEGIN
  IF _source NOT IN ('ia','manuale','rettifica') THEN RAISE EXCEPTION 'origine della versione non valida'; END IF;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_meeting)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono scrivere il verbale'; END IF;
  IF COALESCE(length(trim(_body)),0) < 1 THEN RAISE EXCEPTION 'il testo del verbale è obbligatorio'; END IF;
  IF length(_body) > 60000 THEN RAISE EXCEPTION 'il testo del verbale è troppo lungo'; END IF;
  _mn := NULL; SELECT * INTO _mn FROM public.board_minutes WHERE meeting_id = _meeting FOR UPDATE;
  IF _mn.id IS NULL THEN
    _mn.id := public.board_minutes_ensure(_meeting);
    SELECT * INTO _mn FROM public.board_minutes WHERE id = _mn.id FOR UPDATE;
  END IF;
  IF _mn.status = 'IN_APPROVAZIONE' THEN RAISE EXCEPTION 'verbale in approvazione: il testo è bloccato'; END IF;
  IF _mn.status = 'APPROVATO' AND _source <> 'rettifica' THEN
    RAISE EXCEPTION 'il verbale approvato si modifica solo con una versione rettificata'; END IF;
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

-- Rettifica proposta da un componente, senza toccare il testo ufficiale.
CREATE OR REPLACE FUNCTION public.board_minutes_rectify(_minutes uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _name text;
BEGIN
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _minutes;
  IF _mn.id IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
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

CREATE OR REPLACE FUNCTION public.board_minutes_rectification_decide(_rectification uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.board_minute_rectifications; _mn public.board_minutes;
BEGIN
  IF _status NOT IN ('accolta','non_accolta') THEN RAISE EXCEPTION 'esito non valido'; END IF;
  SELECT * INTO _r FROM public.board_minute_rectifications WHERE id = _rectification FOR UPDATE;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'rettifica inesistente'; END IF;
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _r.minutes_id;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_mn.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono valutare le rettifiche'; END IF;
  IF _r.status <> 'nuova' THEN RAISE EXCEPTION 'rettifica già valutata'; END IF;
  UPDATE public.board_minute_rectifications SET status = _status, handled_by = auth.uid(), handled_at = now() WHERE id = _rectification;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_mn.meeting_id, auth.uid(), 'minutes_rectification_decided',
      jsonb_build_object('minutes_id', _mn.id, 'rectification_id', _rectification, 'outcome', _status, 'name', _r.author_name));
END $$;

-- Il Presidente sottopone il verbale al voto: versione bloccata e identificata, quorum verificato.
CREATE OR REPLACE FUNCTION public.board_minutes_submit_vote(_minutes uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _m public.board_meetings; _q jsonb; _v public.board_minute_versions; _b uuid;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può sottoporre il verbale al voto'; END IF;
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _minutes FOR UPDATE;
  IF _mn.id IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _mn.meeting_id FOR UPDATE;
  IF _m.status <> 'IN_CORSO' OR _m.started_at IS NULL OR _m.ended_at IS NOT NULL THEN RAISE EXCEPTION 'la seduta non è in corso'; END IF;
  IF _mn.status NOT IN ('BOZZA','IN_REVISIONE') THEN RAISE EXCEPTION 'il verbale non è in uno stato sottoponibile al voto'; END IF;
  IF _mn.current_version < 1 THEN RAISE EXCEPTION 'il verbale è vuoto'; END IF;
  _q := public.board_quorum(_mn.meeting_id);
  IF NOT (_q->>'met')::boolean THEN RAISE EXCEPTION 'quorum non raggiunto: non è possibile deliberare'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id = _mn.meeting_id AND status = 'aperta') THEN
    RAISE EXCEPTION 'c''è già una votazione in corso'; END IF;
  SELECT * INTO _v FROM public.board_minute_versions WHERE minutes_id = _mn.id AND version = _mn.current_version FOR UPDATE;
  UPDATE public.board_minute_versions SET locked_at = now() WHERE id = _v.id;
  INSERT INTO public.board_ballots(meeting_id, minutes_id, minutes_version_id, opened_by, quorum)
    VALUES (_mn.meeting_id, _mn.id, _v.id, auth.uid(), _q) RETURNING id INTO _b;
  UPDATE public.board_minutes SET status = 'IN_APPROVAZIONE', updated_at = now() WHERE id = _mn.id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_mn.meeting_id, auth.uid(), 'minutes_ballot_open', jsonb_build_object('minutes_id', _mn.id, 'ballot_id', _b,
      'version', _v.version, 'hash', _v.content_hash, 'quorum', _q));
  RETURN _b;
END $$;

-- Chiusura del voto: generalizzata a delibere e verbali (stessa firma, stesse regole di v17).
CREATE OR REPLACE FUNCTION public.board_ballot_close(_ballot uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.board_ballots; _m public.board_meetings; _q jsonb; _fav int; _con int; _abs int; _tie text;
        _result text; _tie_break boolean := false; _tally jsonb;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può chiudere la votazione'; END IF;
  SELECT * INTO _b FROM public.board_ballots WHERE id = _ballot FOR UPDATE;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'votazione inesistente'; END IF;
  IF _b.status <> 'aperta' THEN RAISE EXCEPTION 'votazione già conclusa'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _b.meeting_id FOR UPDATE;
  IF _m.status <> 'IN_CORSO' OR _m.ended_at IS NOT NULL THEN RAISE EXCEPTION 'la seduta non consente di concludere il voto'; END IF;
  _q := public.board_quorum(_b.meeting_id);
  SELECT COALESCE(count(*) FILTER (WHERE vote = 'favorevole'),0), COALESCE(count(*) FILTER (WHERE vote = 'contrario'),0),
         COALESCE(count(*) FILTER (WHERE vote = 'astenuto'),0)
    INTO _fav, _con, _abs FROM public.board_votes WHERE ballot_id = _ballot;
  IF NOT (_q->>'met')::boolean THEN
    _result := 'senza_quorum';
  ELSIF _fav > _con THEN
    _result := 'approvata';
  ELSIF _fav < _con THEN
    _result := 'respinta';
  ELSE
    SELECT v.vote INTO _tie FROM public.board_votes v
      JOIN public.board_meeting_participants p ON p.id = v.participant_id
      WHERE v.ballot_id = _ballot AND p.user_id IS NOT NULL AND public.is_board_president(p.user_id);
    IF _tie = 'favorevole' THEN _result := 'approvata'; _tie_break := true;
    ELSE _result := 'respinta'; _tie_break := _tie IS NOT NULL; END IF;
  END IF;
  _tally := jsonb_build_object('favorevoli', _fav, 'contrari', _con, 'astenuti', _abs,
    'nomi', (SELECT jsonb_agg(jsonb_build_object('name', display_name, 'vote', vote) ORDER BY display_name)
             FROM public.board_votes WHERE ballot_id = _ballot));
  UPDATE public.board_ballots SET status = 'chiusa', result = _result, closed_by = auth.uid(), closed_at = now(),
    tally = _tally, quorum = _q, tie_break = _tie_break WHERE id = _ballot;
  IF _b.deliberation_id IS NOT NULL THEN
    UPDATE public.board_deliberations SET status = CASE _result WHEN 'approvata' THEN 'APPROVATA' WHEN 'respinta' THEN 'RESPINTA' ELSE 'SENZA_QUORUM' END,
      closed_reason = CASE WHEN _result = 'senza_quorum' THEN 'Quorum venuto meno alla chiusura del voto' ELSE NULL END,
      updated_at = now() WHERE id = _b.deliberation_id;
    UPDATE public.board_deliberation_documents SET status = CASE WHEN _result = 'approvata' THEN 'approvato' ELSE 'respinto' END,
      approved_at = CASE WHEN _result = 'approvata' THEN now() ELSE NULL END WHERE deliberation_id = _b.deliberation_id;
  ELSE
    UPDATE public.board_minutes SET status = CASE WHEN _result = 'approvata' THEN 'APPROVATO' ELSE 'IN_REVISIONE' END,
      updated_at = now() WHERE id = _b.minutes_id;
  END IF;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_b.meeting_id, auth.uid(), 'ballot_close', jsonb_build_object('ballot_id', _ballot, 'deliberation_id', _b.deliberation_id,
      'minutes_id', _b.minutes_id, 'result', _result, 'tally', _tally, 'quorum', _q, 'tie_break', _tie_break));
END $$;

-- Annullamento di una votazione aperta per errore: generalizzato a delibere e verbali.
CREATE OR REPLACE FUNCTION public.board_ballot_cancel(_ballot uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.board_ballots;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può annullare la votazione'; END IF;
  SELECT * INTO _b FROM public.board_ballots WHERE id = _ballot FOR UPDATE;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'votazione inesistente'; END IF;
  IF _b.status <> 'aperta' THEN RAISE EXCEPTION 'votazione non in corso'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivazione obbligatoria'; END IF;
  UPDATE public.board_ballots SET status = 'annullata', closed_by = auth.uid(), closed_at = now(), reason = trim(_reason) WHERE id = _ballot;
  IF _b.deliberation_id IS NOT NULL THEN
    UPDATE public.board_deliberations SET status = 'BOZZA', updated_at = now() WHERE id = _b.deliberation_id;
  ELSE
    UPDATE public.board_minutes SET status = 'IN_REVISIONE', updated_at = now() WHERE id = _b.minutes_id;
  END IF;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_b.meeting_id, auth.uid(), 'ballot_cancel', jsonb_build_object('ballot_id', _ballot,
      'deliberation_id', _b.deliberation_id, 'minutes_id', _b.minutes_id, 'reason', trim(_reason)));
END $$;

-- Registra la versione firmata (solo verbale approvato; il file sta nel bucket privato board-documents).
CREATE OR REPLACE FUNCTION public.board_minutes_signed(_minutes uuid, _storage_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes;
BEGIN
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _minutes FOR UPDATE;
  IF _mn.id IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_mn.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono registrare la versione firmata'; END IF;
  IF _mn.status <> 'APPROVATO' THEN RAISE EXCEPTION 'la versione firmata si registra solo su un verbale approvato'; END IF;
  IF _storage_path IS NULL OR _storage_path !~ ('^' || _mn.meeting_id::text || '/verbale_firmato-[0-9a-f-]{36}\.[a-z0-9]{2,5}$') THEN
    RAISE EXCEPTION 'percorso del file non valido';
  END IF;
  UPDATE public.board_minutes SET signed_path = _storage_path, signed_at = now(), updated_at = now() WHERE id = _minutes;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_mn.meeting_id, auth.uid(), 'minutes_signed', jsonb_build_object('minutes_id', _minutes, 'path', _storage_path));
END $$;

ALTER TABLE public.board_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_minute_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_minute_rectifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_minutes_read ON public.board_minutes;
CREATE POLICY board_minutes_read ON public.board_minutes FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_minute_versions_read ON public.board_minute_versions;
CREATE POLICY board_minute_versions_read ON public.board_minute_versions FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_minutes_meeting(minutes_id)));
DROP POLICY IF EXISTS board_minute_rectifications_read ON public.board_minute_rectifications;
CREATE POLICY board_minute_rectifications_read ON public.board_minute_rectifications FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_minutes_meeting(minutes_id)));

GRANT SELECT ON public.board_minutes, public.board_minute_versions, public.board_minute_rectifications TO authenticated;
GRANT ALL ON public.board_minutes, public.board_minute_versions, public.board_minute_rectifications TO service_role;

-- Bucket privato per i documenti ufficiali della seduta (verbale firmato, fascicolo).
INSERT INTO storage.buckets (id, name, public) VALUES ('board-documents', 'board-documents', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS board_documents_read ON storage.objects;
CREATE POLICY board_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'board-documents' AND public.board_can_view((storage.foldername(name))[1]::uuid));
DROP POLICY IF EXISTS board_documents_write ON storage.objects;
CREATE POLICY board_documents_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-documents' AND public.board_can_view((storage.foldername(name))[1]::uuid));
DROP POLICY IF EXISTS board_documents_remove ON storage.objects;
CREATE POLICY board_documents_remove ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'board-documents' AND public.board_can_view((storage.foldername(name))[1]::uuid));

DO $$ DECLARE _table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH _table IN ARRAY ARRAY['board_minutes','board_minute_versions','board_minute_rectifications'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _table) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',_table);
      END IF;
    END LOOP;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.board_minutes_meeting(uuid), public.board_minutes_ensure(uuid),
  public.board_minutes_save(uuid,text,text), public.board_minutes_rectify(uuid,text),
  public.board_minutes_rectification_decide(uuid,text), public.board_minutes_submit_vote(uuid),
  public.board_minutes_signed(uuid,text),
  public.board_ai_settings_save(boolean,text,text,text,text,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_minutes_meeting(uuid), public.board_minutes_ensure(uuid),
  public.board_minutes_save(uuid,text,text), public.board_minutes_rectify(uuid,text),
  public.board_minutes_rectification_decide(uuid,text), public.board_minutes_submit_vote(uuid),
  public.board_minutes_signed(uuid,text),
  public.board_ai_settings_save(boolean,text,text,text,text,numeric,numeric,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
