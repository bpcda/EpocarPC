-- Epocar: Consiglio Direttivo — Fase 3 (delibere, votazioni palesi, approvazione documenti).
-- rev. 1. Da eseguire nell'SQL Editor del progetto esterno, DOPO board-v15.sql e board-v16.sql. Rieseguibile.
-- Regole: Presidente e verbalizzante scrivono il testo; ogni componente può proporre e suggerire senza editarlo;
-- il Presidente autorizza il voto, da cui il testo è bloccato e identificato; modifiche successive = nuova versione ed eventuale nuovo voto.
BEGIN;

-- Helper: verbalizzante della riunione (deve restare componente del CD).
CREATE OR REPLACE FUNCTION public.board_is_minute_taker(_meeting uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.board_meetings m
    WHERE m.id = _meeting AND m.minute_taker_id = auth.uid() AND public.is_board_member(auth.uid())) $$;


CREATE TABLE IF NOT EXISTS public.board_deliberations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid REFERENCES public.board_agenda_items(id) ON DELETE SET NULL,
  number integer NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'BOZZA' CHECK (status IN ('BOZZA','IN_VOTAZIONE','APPROVATA','RESPINTA','SENZA_QUORUM','RITIRATA')),
  current_version integer NOT NULL DEFAULT 1,
  closed_reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, number)
);
CREATE TABLE IF NOT EXISTS public.board_deliberation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliberation_id uuid NOT NULL REFERENCES public.board_deliberations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  content_hash text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  UNIQUE (deliberation_id, version)
);
CREATE TABLE IF NOT EXISTS public.board_deliberation_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliberation_id uuid NOT NULL REFERENCES public.board_deliberations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 5 AND 4000),
  status text NOT NULL DEFAULT 'nuova' CHECK (status IN ('nuova','accolta','non_accolta')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_by uuid,
  handled_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.board_deliberation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliberation_id uuid NOT NULL REFERENCES public.board_deliberations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  kind text NOT NULL DEFAULT 'documento' CHECK (kind IN ('documento','allegato','relazione')),
  status text NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza','approvato','respinto')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.board_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  deliberation_id uuid NOT NULL REFERENCES public.board_deliberations(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.board_deliberation_versions(id) ON DELETE RESTRICT,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'aperta' CHECK (status IN ('aperta','chiusa','annullata')),
  result text CHECK (result IN ('approvata','respinta','senza_quorum')),
  quorum jsonb NOT NULL DEFAULT '{}',
  tally jsonb NOT NULL DEFAULT '{}',
  tie_break boolean NOT NULL DEFAULT false,
  reason text,
  CHECK (status = 'aperta' OR (status = 'chiusa' AND result IS NOT NULL) OR (status = 'annullata' AND COALESCE(trim(reason),'') <> ''))
);
CREATE UNIQUE INDEX IF NOT EXISTS board_ballots_one_open ON public.board_ballots(meeting_id) WHERE status = 'aperta';
CREATE TABLE IF NOT EXISTS public.board_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.board_ballots(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.board_meeting_participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  vote text NOT NULL CHECK (vote IN ('favorevole','contrario','astenuto')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ballot_id, participant_id)
);

-- Read-only grants; every write goes through the functions below.
GRANT SELECT ON public.board_deliberations, public.board_deliberation_versions, public.board_deliberation_suggestions,
  public.board_deliberation_documents, public.board_ballots, public.board_votes TO authenticated;
GRANT ALL ON public.board_deliberations, public.board_deliberation_versions, public.board_deliberation_suggestions,
  public.board_deliberation_documents, public.board_ballots, public.board_votes TO service_role;
ALTER TABLE public.board_deliberations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_deliberation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_deliberation_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_deliberation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_deliberations_read ON public.board_deliberations;
CREATE POLICY board_deliberations_read ON public.board_deliberations FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_deliberation_versions_read ON public.board_deliberation_versions;
CREATE POLICY board_deliberation_versions_read ON public.board_deliberation_versions FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_deliberation_meeting(deliberation_id)));
DROP POLICY IF EXISTS board_deliberation_suggestions_read ON public.board_deliberation_suggestions;
CREATE POLICY board_deliberation_suggestions_read ON public.board_deliberation_suggestions FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_deliberation_meeting(deliberation_id)));
DROP POLICY IF EXISTS board_deliberation_documents_read ON public.board_deliberation_documents;
CREATE POLICY board_deliberation_documents_read ON public.board_deliberation_documents FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_deliberation_meeting(deliberation_id)));
DROP POLICY IF EXISTS board_ballots_read ON public.board_ballots;
CREATE POLICY board_ballots_read ON public.board_ballots FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_votes_read ON public.board_votes;
CREATE POLICY board_votes_read ON public.board_votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.board_ballots b WHERE b.id = ballot_id AND public.board_can_view(b.meeting_id)));

-- Draft or revise a deliberation (President or minute taker, only while the session is open and not yet voted).
CREATE OR REPLACE FUNCTION public.board_deliberation_save(_meeting uuid, _id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _d public.board_deliberations; _v public.board_deliberation_versions;
        _title text; _body text; _item uuid; _n int; _ver int; _doc jsonb; _hash text; _did uuid;
BEGIN
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_meeting)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono scrivere la delibera'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  IF _m.started_at IS NULL OR _m.ended_at IS NOT NULL OR _m.status NOT IN ('IN_CORSO','SOSPESO') THEN
    RAISE EXCEPTION 'le delibere si scrivono durante la seduta'; END IF;
  _title := trim(COALESCE(_payload->>'title','')); _body := trim(COALESCE(_payload->>'body',''));
  IF length(_title) = 0 THEN RAISE EXCEPTION 'titolo della delibera obbligatorio'; END IF;
  IF length(_title) > 300 THEN RAISE EXCEPTION 'titolo troppo lungo'; END IF;
  IF length(_body) = 0 THEN RAISE EXCEPTION 'testo della delibera obbligatorio'; END IF;
  IF length(_body) > 20000 THEN RAISE EXCEPTION 'testo della delibera troppo lungo'; END IF;
  _item := NULLIF(_payload->>'agenda_item_id','')::uuid;
  IF _item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.board_agenda_items WHERE id = _item AND meeting_id = _meeting) THEN
    RAISE EXCEPTION 'punto dell''ordine del giorno estraneo alla riunione'; END IF;
  IF jsonb_typeof(_payload->'documents') = 'array' AND jsonb_array_length(_payload->'documents') > 20 THEN
    RAISE EXCEPTION 'massimo 20 documenti per delibera'; END IF;

  IF _id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('board_deliberation_number'));
    SELECT COALESCE(max(number),0)+1 INTO _n FROM public.board_deliberations WHERE meeting_id = _meeting;
    INSERT INTO public.board_deliberations(meeting_id, agenda_item_id, number, title, created_by)
      VALUES (_meeting, _item, _n, _title, auth.uid()) RETURNING id INTO _did;
    INSERT INTO public.board_deliberation_versions(deliberation_id, version, title, body, content_hash, created_by)
      VALUES (_did, 1, _title, _body, md5(_title || E'\n' || _body), auth.uid());
    INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
      VALUES (_meeting, auth.uid(), 'deliberation_created', jsonb_build_object('deliberation_id', _did, 'number', _n, 'version', 1));
  ELSE
    SELECT * INTO _d FROM public.board_deliberations WHERE id = _id FOR UPDATE;
    IF _d.id IS NULL OR _d.meeting_id <> _meeting THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
    IF _d.status IN ('APPROVATA','RITIRATA') THEN RAISE EXCEPTION 'la delibera non è più modificabile'; END IF;
    IF _d.status = 'IN_VOTAZIONE' THEN RAISE EXCEPTION 'delibera in votazione: il testo è bloccato'; END IF;
    IF EXISTS (SELECT 1 FROM public.board_ballots WHERE deliberation_id = _id AND status = 'aperta') THEN
      RAISE EXCEPTION 'votazione in corso su questa delibera'; END IF;
    SELECT * INTO _v FROM public.board_deliberation_versions WHERE deliberation_id = _id AND version = _d.current_version;
    _hash := md5(_title || E'\n' || _body);
    IF _v.title = _title AND _v.body = _body THEN
      UPDATE public.board_deliberations SET agenda_item_id = _item, updated_at = now() WHERE id = _id;
      _did := _id;
    ELSE
      _ver := _d.current_version + 1;
      INSERT INTO public.board_deliberation_versions(deliberation_id, version, title, body, content_hash, created_by)
        VALUES (_id, _ver, _title, _body, _hash, auth.uid());
      UPDATE public.board_deliberations SET agenda_item_id = _item, current_version = _ver, status = 'BOZZA',
        closed_reason = NULL, updated_at = now() WHERE id = _id;
      INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
        VALUES (_meeting, auth.uid(), 'deliberation_version', jsonb_build_object('deliberation_id', _id, 'number', _d.number,
          'from', _d.current_version, 'to', _ver, 'hash', _hash));
      _did := _id;
    END IF;
  END IF;

  IF jsonb_typeof(_payload->'documents') = 'array' THEN
    DELETE FROM public.board_deliberation_documents WHERE deliberation_id = _did AND status = 'bozza';
    FOR _doc IN SELECT * FROM jsonb_array_elements(_payload->'documents') LOOP
      IF COALESCE(trim(_doc->>'name'),'') = '' THEN RAISE EXCEPTION 'nome documento obbligatorio'; END IF;
      INSERT INTO public.board_deliberation_documents(deliberation_id, name, kind, created_by)
        VALUES (_did, trim(_doc->>'name'), COALESCE(NULLIF(_doc->>'kind',''),'documento'), auth.uid());
    END LOOP;
  END IF;
  RETURN _did;
END $$;

-- Any board member may propose a change without touching the official text.
CREATE OR REPLACE FUNCTION public.board_deliberation_suggest(_deliberation uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations; _name text;
BEGIN
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id = _d.meeting_id AND status IN ('IN_CORSO','SOSPESO')
                 AND started_at IS NOT NULL AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'la seduta non è in corso'; END IF;
  IF COALESCE(length(trim(_body)),0) < 5 THEN RAISE EXCEPTION 'il suggerimento è troppo breve'; END IF;
  IF length(trim(_body)) > 4000 THEN RAISE EXCEPTION 'il suggerimento è troppo lungo'; END IF;
  SELECT COALESCE(NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),''),'Componente senza nome')
    INTO _name FROM public.profiles p WHERE p.user_id = auth.uid();
  INSERT INTO public.board_deliberation_suggestions(deliberation_id, author_id, author_name, body)
    VALUES (_deliberation, auth.uid(), COALESCE(_name,'Componente senza nome'), trim(_body));
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'deliberation_suggested',
      jsonb_build_object('deliberation_id', _deliberation, 'name', COALESCE(_name,'Componente senza nome')));
END $$;

-- President or minute taker records the outcome of a suggestion.
CREATE OR REPLACE FUNCTION public.board_deliberation_suggestion_decide(_suggestion uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.board_deliberation_suggestions; _d public.board_deliberations;
BEGIN
  IF _status NOT IN ('accolta','non_accolta') THEN RAISE EXCEPTION 'esito non valido'; END IF;
  SELECT * INTO _s FROM public.board_deliberation_suggestions WHERE id = _suggestion FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'suggerimento inesistente'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _s.deliberation_id;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_d.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono valutare i suggerimenti'; END IF;
  IF _s.status <> 'nuova' THEN RAISE EXCEPTION 'suggerimento già valutato'; END IF;
  UPDATE public.board_deliberation_suggestions SET status = _status, handled_by = auth.uid(), handled_at = now() WHERE id = _suggestion;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'deliberation_suggestion_decided',
      jsonb_build_object('deliberation_id', _d.id, 'suggestion_id', _suggestion, 'outcome', _status, 'name', _s.author_name));
END $$;

-- Withdraw a draft or a rejected deliberation (never an approved one).
CREATE OR REPLACE FUNCTION public.board_deliberation_withdraw(_deliberation uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations;
BEGIN
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
  IF NOT (public.is_board_president(auth.uid()) OR public.board_is_minute_taker(_d.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono ritirare la delibera'; END IF;
  IF _d.status IN ('APPROVATA','RITIRATA') THEN RAISE EXCEPTION 'la delibera non è ritirabile'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE deliberation_id = _deliberation AND status = 'aperta') THEN
    RAISE EXCEPTION 'votazione in corso: concluderla prima di ritirare'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivazione obbligatoria'; END IF;
  UPDATE public.board_deliberations SET status = 'RITIRATA', closed_reason = trim(_reason), updated_at = now() WHERE id = _deliberation;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'deliberation_withdrawn', jsonb_build_object('deliberation_id', _deliberation, 'reason', trim(_reason)));
END $$;

-- President authorizes the vote: the version under vote is locked and uniquely identified.
CREATE OR REPLACE FUNCTION public.board_ballot_open(_deliberation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations; _m public.board_meetings; _q jsonb; _v public.board_deliberation_versions; _b uuid;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può mettere ai voti'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _d.meeting_id FOR UPDATE;
  IF _m.status <> 'IN_CORSO' OR _m.started_at IS NULL OR _m.ended_at IS NOT NULL THEN RAISE EXCEPTION 'la seduta non è in corso'; END IF;
  IF _d.status <> 'BOZZA' THEN RAISE EXCEPTION 'solo una bozza può essere messa ai voti'; END IF;
  _q := public.board_quorum(_d.meeting_id);
  IF NOT (_q->>'met')::boolean THEN RAISE EXCEPTION 'quorum non raggiunto: non è possibile deliberare'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id = _d.meeting_id AND status = 'aperta') THEN
    RAISE EXCEPTION 'c''è già una votazione in corso'; END IF;
  SELECT * INTO _v FROM public.board_deliberation_versions WHERE deliberation_id = _d.id AND version = _d.current_version FOR UPDATE;
  UPDATE public.board_deliberation_versions SET locked_at = now() WHERE id = _v.id;
  INSERT INTO public.board_ballots(meeting_id, deliberation_id, version_id, opened_by, quorum)
    VALUES (_d.meeting_id, _d.id, _v.id, auth.uid(), _q) RETURNING id INTO _b;
  UPDATE public.board_deliberations SET status = 'IN_VOTAZIONE', updated_at = now() WHERE id = _d.id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'ballot_open', jsonb_build_object('deliberation_id', _d.id, 'ballot_id', _b,
      'number', _d.number, 'version', _v.version, 'hash', _v.content_hash, 'quorum', _q));
  RETURN _b;
END $$;

-- Recorded name by name: one vote per voting participant, only while the vote is open.
CREATE OR REPLACE FUNCTION public.board_ballot_vote(_ballot uuid, _vote text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.board_ballots; _p public.board_meeting_participants; _old text; _first boolean := true;
BEGIN
  IF _vote NOT IN ('favorevole','contrario','astenuto') THEN RAISE EXCEPTION 'voto non valido'; END IF;
  SELECT * INTO _b FROM public.board_ballots WHERE id = _ballot;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'votazione inesistente'; END IF;
  IF _b.status <> 'aperta' THEN RAISE EXCEPTION 'votazione non aperta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id = _b.meeting_id AND status = 'IN_CORSO' AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'la seduta non consente di votare'; END IF;
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _p FROM public.board_meeting_participants WHERE meeting_id = _b.meeting_id AND user_id = auth.uid();
  IF _p.id IS NULL OR _p.kind <> 'member' OR NOT _p.can_vote THEN RAISE EXCEPTION 'non hai diritto di voto'; END IF;
  IF NOT _p.present OR _p.identified_at IS NULL THEN RAISE EXCEPTION 'la tua presenza non è stata verificata'; END IF;
  SELECT vote INTO _old FROM public.board_votes WHERE ballot_id = _ballot AND participant_id = _p.id FOR UPDATE;
  IF _old IS NULL THEN
    INSERT INTO public.board_votes(ballot_id, participant_id, user_id, display_name, vote)
      VALUES (_ballot, _p.id, auth.uid(), _p.display_name, _vote);
  ELSE
    IF _old = _vote THEN RAISE EXCEPTION 'hai già espresso questo voto'; END IF;
    UPDATE public.board_votes SET vote = _vote, recorded_at = now() WHERE ballot_id = _ballot AND participant_id = _p.id;
    _first := false;
  END IF;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_b.meeting_id, auth.uid(), 'ballot_vote', jsonb_build_object('ballot_id', _ballot, 'deliberation_id', _b.deliberation_id,
      'name', _p.display_name, 'vote', _vote, 'changed', NOT _first));
END $$;

-- President closes the vote: quorum re-checked, majority of votes, President's casting vote only on a tie.
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
  UPDATE public.board_deliberations SET status = CASE _result WHEN 'approvata' THEN 'APPROVATA' WHEN 'respinta' THEN 'RESPINTA' ELSE 'SENZA_QUORUM' END,
    closed_reason = CASE WHEN _result = 'senza_quorum' THEN 'Quorum venuto meno alla chiusura del voto' ELSE NULL END,
    updated_at = now() WHERE id = _b.deliberation_id;
  UPDATE public.board_deliberation_documents SET status = CASE WHEN _result = 'approvata' THEN 'approvato' ELSE 'respinto' END,
    approved_at = CASE WHEN _result = 'approvata' THEN now() ELSE NULL END WHERE deliberation_id = _b.deliberation_id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_b.meeting_id, auth.uid(), 'ballot_close', jsonb_build_object('ballot_id', _ballot, 'deliberation_id', _b.deliberation_id,
      'result', _result, 'tally', _tally, 'quorum', _q, 'tie_break', _tie_break));
END $$;

-- President may cancel a vote that was opened in error; the text returns to draft.
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
  UPDATE public.board_deliberations SET status = 'BOZZA', updated_at = now() WHERE id = _b.deliberation_id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_b.meeting_id, auth.uid(), 'ballot_cancel', jsonb_build_object('ballot_id', _ballot,
      'deliberation_id', _b.deliberation_id, 'reason', trim(_reason)));
END $$;

-- Realtime: the four Phase 2 tables plus the Phase 3 ones, all protected by RLS.
DO $$ DECLARE _table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH _table IN ARRAY ARRAY['board_deliberations','board_deliberation_versions','board_deliberation_suggestions',
                                  'board_deliberation_documents','board_ballots','board_votes'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _table) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',_table);
      END IF;
    END LOOP;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.board_is_minute_taker(uuid), public.board_deliberation_meeting(uuid),
  public.board_deliberation_save(uuid,uuid,jsonb), public.board_deliberation_suggest(uuid,text),
  public.board_deliberation_suggestion_decide(uuid,text), public.board_deliberation_withdraw(uuid,text),
  public.board_ballot_open(uuid), public.board_ballot_vote(uuid,text), public.board_ballot_close(uuid),
  public.board_ballot_cancel(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_is_minute_taker(uuid), public.board_deliberation_meeting(uuid),
  public.board_deliberation_save(uuid,uuid,jsonb), public.board_deliberation_suggest(uuid,text),
  public.board_deliberation_suggestion_decide(uuid,text), public.board_deliberation_withdraw(uuid,text),
  public.board_ballot_open(uuid), public.board_ballot_vote(uuid,text), public.board_ballot_close(uuid),
  public.board_ballot_cancel(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
