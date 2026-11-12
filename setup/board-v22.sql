-- Consiglio Direttivo — integrazione, passo 2. Installare DOPO board-v21.sql.
-- Criterio applicativo concordato il 12/11/2026: maggioranza dei presenti;
-- in parità sì/no non nulla prevale il voto sì/no di chi presiede.
BEGIN;

ALTER TABLE public.board_meetings ADD COLUMN IF NOT EXISTS chair_id uuid;
ALTER TABLE public.board_meetings ADD COLUMN IF NOT EXISTS chair_kind text
  CHECK (chair_kind IN ('president','vice','designated'));

CREATE OR REPLACE FUNCTION public.board_chair_user(_meeting uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN m.chair_id IS NOT NULL THEN
    CASE WHEN public.is_board_member(m.chair_id) AND
      (m.chair_kind = 'designated' OR m.chair_kind = 'president' AND public.is_board_president(m.chair_id)
       OR m.chair_kind = 'vice' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = m.chair_id AND role::text = 'vice_president'))
    THEN m.chair_id END
  ELSE (SELECT min(user_id::text)::uuid FROM public.user_roles WHERE role::text = 'president' HAVING count(DISTINCT user_id) = 1) END
  FROM public.board_meetings m WHERE m.id = _meeting AND public.board_can_view(m.id)
$$;

CREATE OR REPLACE FUNCTION public.board_is_chair(_meeting uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.uid() = public.board_chair_user(_meeting), false)
$$;

CREATE TABLE IF NOT EXISTS public.board_deliberation_conflicts (
  deliberation_id uuid NOT NULL REFERENCES public.board_deliberations(id) ON DELETE RESTRICT,
  participant_id uuid NOT NULL REFERENCES public.board_meeting_participants(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  declared_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  PRIMARY KEY (deliberation_id, participant_id)
);
ALTER TABLE public.board_deliberation_conflicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_conflicts_read ON public.board_deliberation_conflicts;
CREATE POLICY board_conflicts_read ON public.board_deliberation_conflicts FOR SELECT TO authenticated
  USING (public.board_can_view(public.board_deliberation_meeting(deliberation_id)));
REVOKE ALL ON public.board_deliberation_conflicts FROM authenticated, anon;
GRANT SELECT ON public.board_deliberation_conflicts TO authenticated;
GRANT ALL ON public.board_deliberation_conflicts TO service_role;
DROP TRIGGER IF EXISTS board_archive_guard ON public.board_deliberation_conflicts;
CREATE TRIGGER board_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON public.board_deliberation_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.board_archive_guard();

-- L'uscita temporanea non cambia le cariche né il denominatore del quorum.
CREATE OR REPLACE FUNCTION public.board_voter_eligible(_meeting uuid, _user uuid, _deliberation uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.board_can_view(_meeting) AND public.is_board_member(_user) AND EXISTS (
    SELECT 1 FROM public.board_meeting_participants p WHERE p.meeting_id = _meeting AND p.user_id = _user
      AND p.kind = 'member' AND p.can_vote AND p.present AND p.identified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c WHERE c.participant_id = p.id
        AND (c.returned_at IS NULL OR c.deliberation_id = _deliberation)))
$$;

CREATE OR REPLACE FUNCTION public.board_ballot_quorum(_meeting uuid, _deliberation uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _total int; _present int;
BEGIN
  IF NOT public.board_can_view(_meeting) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT count(DISTINCT user_id) INTO _total FROM public.user_roles
    WHERE role::text IN ('president','vice_president','secretary','treasurer','councillor');
  SELECT count(DISTINCT user_id) INTO _present FROM public.board_meeting_participants
    WHERE meeting_id = _meeting AND public.board_voter_eligible(_meeting, user_id, _deliberation);
  RETURN jsonb_build_object('total',_total,'present',_present,'required',(_total / 2)+1,
    'met',_total > 0 AND _present >= (_total / 2)+1);
END $$;

CREATE OR REPLACE FUNCTION public.board_quorum(_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.board_ballot_quorum(_id, NULL)
$$;

-- Il verbalizzante registra la designazione del Consiglio solo se mancano Presidente e Vicepresidente.
CREATE OR REPLACE FUNCTION public.board_chair_assign(_meeting uuid, _user uuid, _reason text, _designation text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _kind text; _pres_present boolean; _vice_present boolean;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _m.id IS NULL OR _m.ended_at IS NOT NULL OR _m.status NOT IN ('CONVOCATO','IN_CORSO','SOSPESO') THEN
    RAISE EXCEPTION 'presidenza non modificabile'; END IF;
  IF COALESCE(length(trim(_reason)),0) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'causale obbligatoria (massimo 1000 caratteri)'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id = _meeting AND status = 'aperta') THEN
    RAISE EXCEPTION 'concludi o annulla la votazione prima di cambiare presidenza'; END IF;
  IF NOT public.board_voter_eligible(_meeting, _user, NULL) THEN RAISE EXCEPTION 'chi presiede deve essere un componente con presenza verificata'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.board_meeting_participants p WHERE p.meeting_id = _meeting
    AND public.is_board_president(p.user_id) AND public.board_voter_eligible(_meeting,p.user_id,NULL)) INTO _pres_present;
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.role::text = 'vice_president'
    AND public.board_voter_eligible(_meeting,r.user_id,NULL)) INTO _vice_present;
  _kind := CASE WHEN public.is_board_president(_user) THEN 'president'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user AND role::text = 'vice_president') THEN 'vice' ELSE 'designated' END;
  IF NOT (public.is_board_president(auth.uid()) OR
    (auth.uid() = _user AND _kind = 'vice' AND NOT _pres_present) OR
    (public.board_is_minute_taker(_meeting) AND NOT _pres_present AND NOT _vice_present
      AND (public.board_quorum(_meeting)->>'met')::boolean)) THEN
    RAISE EXCEPTION 'attivazione riservata al Presidente, al Vicepresidente che lo sostituisce o al verbalizzante con quorum in assenza di entrambi'; END IF;
  IF _kind <> 'president' AND _pres_present THEN RAISE EXCEPTION 'registrare prima l''impedimento e l''uscita del Presidente'; END IF;
  IF _kind = 'designated' THEN
    IF _vice_present THEN RAISE EXCEPTION 'la sostituzione spetta al Vicepresidente presente'; END IF;
    IF COALESCE(length(trim(_designation)),0) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'riferimento alla designazione del Consiglio obbligatorio'; END IF;
  END IF;
  UPDATE public.board_meetings SET chair_id = _user, chair_kind = _kind, updated_at = now() WHERE id = _meeting;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_meeting,auth.uid(),'chair_assigned',
    jsonb_build_object('previous_user_id',_m.chair_id,'user_id',_user,'kind',_kind,'reason',trim(_reason),'designation',NULLIF(trim(_designation),'')));
END $$;

CREATE OR REPLACE FUNCTION public.board_conflict_set(_deliberation uuid, _action text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations; _m public.board_meetings; _p public.board_meeting_participants;
BEGIN
  SELECT meeting_id INTO _d.meeting_id FROM public.board_deliberations WHERE id = _deliberation;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _d.meeting_id FOR UPDATE;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation FOR UPDATE;
  IF _m.id IS NULL OR _m.ended_at IS NOT NULL OR _m.status NOT IN ('IN_CORSO','SOSPESO') THEN RAISE EXCEPTION 'seduta non in corso'; END IF;
  SELECT * INTO _p FROM public.board_meeting_participants WHERE meeting_id = _m.id AND user_id = auth.uid();
  IF NOT public.is_board_member(auth.uid()) OR _p.kind IS DISTINCT FROM 'member' OR NOT _p.present OR _p.identified_at IS NULL THEN
    RAISE EXCEPTION 'presenza verificata obbligatoria'; END IF;
  IF _action = 'declare' THEN
    IF _d.status IN ('APPROVATA','RESPINTA','SENZA_QUORUM','RITIRATA') THEN RAISE EXCEPTION 'punto già concluso'; END IF;
    IF COALESCE(length(trim(_reason)),0) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'motivazione del conflitto obbligatoria'; END IF;
    IF EXISTS (SELECT 1 FROM public.board_votes v JOIN public.board_ballots b ON b.id=v.ballot_id
      WHERE b.deliberation_id=_deliberation AND b.status='aperta' AND v.user_id=auth.uid()) THEN
      RAISE EXCEPTION 'annullare la votazione prima di dichiarare un conflitto dopo il voto'; END IF;
    INSERT INTO public.board_deliberation_conflicts(deliberation_id,participant_id,reason) VALUES (_deliberation,_p.id,trim(_reason));
    INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_m.id,auth.uid(),'conflict_declared',
      jsonb_build_object('deliberation_id',_deliberation,'participant_id',_p.id,'name',_p.display_name,'reason',trim(_reason)));
    INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_m.id,auth.uid(),'conflict_leave',
      jsonb_build_object('deliberation_id',_deliberation,'participant_id',_p.id,'name',_p.display_name));
  ELSIF _action = 'return' THEN
    IF _d.status IN ('BOZZA','IN_VOTAZIONE') AND (_d.agenda_item_id IS NULL OR _m.active_agenda_id IS NOT DISTINCT FROM _d.agenda_item_id) THEN
      RAISE EXCEPTION 'attendere la conclusione del punto prima di rientrare'; END IF;
    UPDATE public.board_deliberation_conflicts SET returned_at=now() WHERE deliberation_id=_deliberation AND participant_id=_p.id AND returned_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'nessuna uscita da concludere'; END IF;
    INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_m.id,auth.uid(),'conflict_return',
      jsonb_build_object('deliberation_id',_deliberation,'participant_id',_p.id,'name',_p.display_name));
  ELSE RAISE EXCEPTION 'azione non valida'; END IF;
END $$;

-- Ordine comune: seduta → votazione/atto → righe figlie; lo stato si legge dopo il lock.

CREATE OR REPLACE FUNCTION public.board_attendance_set(_id uuid, _participant uuid, _present boolean,
  _mode text DEFAULT NULL, _verified boolean DEFAULT false, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _p public.board_meeting_participants;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _id FOR UPDATE;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL OR _m.status NOT IN ('CONVOCATO','IN_CORSO','SOSPESO') OR _m.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'presenze non modificabili'; END IF;
  IF NOT (public.board_is_chair(_id) OR
    (auth.uid() = _m.minute_taker_id AND public.is_board_member(auth.uid()))) THEN
    RAISE EXCEPTION 'solo Presidente o verbalizzante'; END IF;
  SELECT * INTO _p FROM public.board_meeting_participants WHERE id = _participant AND meeting_id = _id FOR UPDATE;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'partecipante inesistente'; END IF;
  IF _present IS NULL OR COALESCE(length(trim(_note)),0) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'nota di verifica obbligatoria (massimo 1000 caratteri)'; END IF;
  IF _present THEN
    IF _verified IS DISTINCT FROM true OR _mode IS NULL OR _mode NOT IN ('presenza','remoto') THEN
      RAISE EXCEPTION 'identificazione e modalità obbligatorie'; END IF;
    IF (_m.mode = 'presenza' AND _mode <> 'presenza') OR (_m.mode = 'remoto' AND _mode <> 'remoto') THEN
      RAISE EXCEPTION 'modalità incompatibile con la convocazione'; END IF;
  END IF;
  UPDATE public.board_meeting_participants SET present = _present,
    attendance_mode = CASE WHEN _present THEN _mode ELSE attendance_mode END,
    identified_by = CASE WHEN _present THEN auth.uid() ELSE identified_by END,
    identified_at = CASE WHEN _present THEN now() ELSE identified_at END,
    attendance_note = trim(_note), attendance_requested_at = NULL WHERE id = _participant;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail)
    VALUES (_id,auth.uid(),CASE WHEN _present THEN 'attendance_enter' ELSE 'attendance_leave' END,
      jsonb_build_object('participant_id',_participant,'name',_p.display_name,'mode',_mode,'note',trim(_note),'quorum',public.board_quorum(_id)));
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
    SELECT EXISTS (SELECT 1 FROM public.board_minutes WHERE meeting_id = _id AND status = 'APPROVATO') INTO _approved;
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

CREATE OR REPLACE FUNCTION public.board_agenda_select(_id uuid, _agenda uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF NOT public.board_is_chair(_id) THEN RAISE EXCEPTION 'solo il Presidente'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.status IS DISTINCT FROM 'IN_CORSO' THEN RAISE EXCEPTION 'seduta non in corso'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_agenda_items WHERE id = _agenda AND meeting_id = _id) THEN
    RAISE EXCEPTION 'punto estraneo alla riunione'; END IF;
  IF _m.active_agenda_id = _agenda THEN RETURN; END IF;
  UPDATE public.board_agenda_items SET discussion_status = 'discussed' WHERE meeting_id = _id AND discussion_status = 'current';
  UPDATE public.board_agenda_items SET discussion_status = 'current' WHERE id = _agenda;
  UPDATE public.board_meetings SET active_agenda_id = _agenda, updated_at = now() WHERE id = _id;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail)
    VALUES (_id,auth.uid(),'agenda_selected',jsonb_build_object('agenda_id',_agenda));
END $$;

CREATE OR REPLACE FUNCTION public.board_heartbeat(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.board_meeting_participants SET last_seen_at = now()
    WHERE meeting_id = _id AND user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.board_meetings WHERE id = _id AND status IN ('CONVOCATO','IN_CORSO','SOSPESO') AND ended_at IS NULL);
  -- Non modifica mai presenza, identificazione o quorum.
END $$;

CREATE OR REPLACE FUNCTION public.board_deliberation_save(_meeting uuid, _id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _d public.board_deliberations; _v public.board_deliberation_versions;
        _title text; _body text; _item uuid; _n int; _ver int; _doc jsonb; _hash text; _did uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
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

  IF _id IS NOT NULL AND EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=_id AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di interessi: non puoi intervenire su questo punto'; END IF;
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

CREATE OR REPLACE FUNCTION public.board_deliberation_suggest(_deliberation uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations; _name text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation) FOR UPDATE;
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=_deliberation AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di interessi: non puoi intervenire su questo punto'; END IF;
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

CREATE OR REPLACE FUNCTION public.board_deliberation_suggestion_decide(_suggestion uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.board_deliberation_suggestions; _d public.board_deliberations;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT d.meeting_id FROM public.board_deliberations d JOIN public.board_deliberation_suggestions s ON s.deliberation_id = d.id WHERE s.id = _suggestion) FOR UPDATE;
  IF _status NOT IN ('accolta','non_accolta') THEN RAISE EXCEPTION 'esito non valido'; END IF;
  SELECT * INTO _s FROM public.board_deliberation_suggestions WHERE id = _suggestion FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'suggerimento inesistente'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _s.deliberation_id;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=_s.deliberation_id AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di interessi: non puoi intervenire su questo punto'; END IF;
  IF NOT (public.board_is_chair((SELECT d.meeting_id FROM public.board_deliberations d JOIN public.board_deliberation_suggestions s ON s.deliberation_id = d.id WHERE s.id = _suggestion)) OR public.board_is_minute_taker(_d.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono valutare i suggerimenti'; END IF;
  IF _s.status <> 'nuova' THEN RAISE EXCEPTION 'suggerimento già valutato'; END IF;
  UPDATE public.board_deliberation_suggestions SET status = _status, handled_by = auth.uid(), handled_at = now() WHERE id = _suggestion;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'deliberation_suggestion_decided',
      jsonb_build_object('deliberation_id', _d.id, 'suggestion_id', _suggestion, 'outcome', _status, 'name', _s.author_name));
END $$;

CREATE OR REPLACE FUNCTION public.board_deliberation_withdraw(_deliberation uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation) FOR UPDATE;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=_deliberation AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di interessi: non puoi intervenire su questo punto'; END IF;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
  IF NOT (public.board_is_chair((SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation)) OR public.board_is_minute_taker(_d.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono ritirare la delibera'; END IF;
  IF _d.status IN ('APPROVATA','RITIRATA') THEN RAISE EXCEPTION 'la delibera non è ritirabile'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE deliberation_id = _deliberation AND status = 'aperta') THEN
    RAISE EXCEPTION 'votazione in corso: concluderla prima di ritirare'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivazione obbligatoria'; END IF;
  UPDATE public.board_deliberations SET status = 'RITIRATA', closed_reason = trim(_reason), updated_at = now() WHERE id = _deliberation;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'deliberation_withdrawn', jsonb_build_object('deliberation_id', _deliberation, 'reason', trim(_reason)));
END $$;

CREATE OR REPLACE FUNCTION public.board_ballot_open(_deliberation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations; _m public.board_meetings; _q jsonb; _v public.board_deliberation_versions; _b uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation) FOR UPDATE;
  IF NOT public.board_is_chair((SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation)) THEN RAISE EXCEPTION 'solo il Presidente può mettere ai voti'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id
    WHERE c.deliberation_id=_deliberation AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di chi presiede: registrare una sostituzione prima del voto'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _d.meeting_id FOR UPDATE;
  IF _m.status <> 'IN_CORSO' OR _m.started_at IS NULL OR _m.ended_at IS NOT NULL THEN RAISE EXCEPTION 'la seduta non è in corso'; END IF;
  IF _d.status <> 'BOZZA' THEN RAISE EXCEPTION 'solo una bozza può essere messa ai voti'; END IF;
  _q := public.board_ballot_quorum(_d.meeting_id,_d.id);
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

CREATE OR REPLACE FUNCTION public.board_ballot_vote(_ballot uuid, _vote text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.board_ballots; _p public.board_meeting_participants; _old text; _first boolean := true;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_ballots WHERE id = _ballot) FOR UPDATE;
  IF _vote NOT IN ('favorevole','contrario','astenuto') THEN RAISE EXCEPTION 'voto non valido'; END IF;
  SELECT * INTO _b FROM public.board_ballots WHERE id = _ballot FOR UPDATE;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'votazione inesistente'; END IF;
  IF _b.status <> 'aperta' THEN RAISE EXCEPTION 'votazione non aperta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id = _b.meeting_id AND status = 'IN_CORSO' AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'la seduta non consente di votare'; END IF;
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _p FROM public.board_meeting_participants WHERE meeting_id = _b.meeting_id AND user_id = auth.uid();
  IF _p.id IS NULL OR _p.kind <> 'member' OR NOT _p.can_vote THEN RAISE EXCEPTION 'non hai diritto di voto'; END IF;
  IF NOT _p.present OR _p.identified_at IS NULL THEN RAISE EXCEPTION 'la tua presenza non è stata verificata'; END IF;
  IF NOT public.board_voter_eligible(_b.meeting_id,auth.uid(),_b.deliberation_id) THEN
    RAISE EXCEPTION 'conflitto di interessi o uscita temporanea: voto non consentito'; END IF;
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
      'user_id', auth.uid(), 'participant_id', _p.id, 'name', _p.display_name, 'vote', _vote, 'changed', NOT _first));
END $$;

CREATE OR REPLACE FUNCTION public.board_ballot_close(_ballot uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.board_ballots; _m public.board_meetings; _q jsonb; _fav int; _con int; _abs int; _tie text;
        _result text; _tie_break boolean := false; _tally jsonb;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_ballots WHERE id = _ballot) FOR UPDATE;
  IF NOT public.board_is_chair((SELECT meeting_id FROM public.board_ballots WHERE id = _ballot)) THEN RAISE EXCEPTION 'solo il Presidente può chiudere la votazione'; END IF;
  SELECT * INTO _b FROM public.board_ballots WHERE id = _ballot FOR UPDATE;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'votazione inesistente'; END IF;
  IF _b.status <> 'aperta' THEN RAISE EXCEPTION 'votazione già conclusa'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id
    WHERE c.deliberation_id=_b.deliberation_id AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di chi presiede: annullare il voto e registrare una sostituzione'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _b.meeting_id FOR UPDATE;
  IF _m.status <> 'IN_CORSO' OR _m.ended_at IS NOT NULL THEN RAISE EXCEPTION 'la seduta non consente di concludere il voto'; END IF;
  _q := public.board_ballot_quorum(_b.meeting_id,_b.deliberation_id);
  SELECT COALESCE(count(*) FILTER (WHERE vote = 'favorevole'),0), COALESCE(count(*) FILTER (WHERE vote = 'contrario'),0),
         COALESCE(count(*) FILTER (WHERE vote = 'astenuto'),0)
    INTO _fav, _con, _abs FROM public.board_votes WHERE ballot_id = _ballot AND public.board_voter_eligible(_b.meeting_id,user_id,_b.deliberation_id);
  IF NOT (_q->>'met')::boolean THEN
    _result := 'senza_quorum';
  ELSIF _fav > (_q->>'present')::int / 2 THEN
    _result := 'approvata';
  ELSIF _fav = _con AND _fav > 0 THEN
    SELECT v.vote INTO _tie FROM public.board_votes v
      JOIN public.board_meeting_participants p ON p.id = v.participant_id
      WHERE v.ballot_id = _ballot AND p.user_id = public.board_chair_user(_b.meeting_id) AND public.board_voter_eligible(_b.meeting_id,p.user_id,_b.deliberation_id);
    IF _tie = 'favorevole' THEN _result := 'approvata'; _tie_break := true;
    ELSE _result := 'respinta'; _tie_break := COALESCE(_tie = 'contrario', false); END IF;
  ELSE _result := 'respinta';
  END IF;
  _tally := jsonb_build_object('favorevoli', _fav, 'contrari', _con, 'astenuti', _abs,
    'rule', 'present_majority_chair_tie_v1', 'presenti', (_q->>'present')::int,
    'mancanti', (_q->>'present')::int - _fav - _con - _abs, 'chair_user_id', public.board_chair_user(_b.meeting_id),
    'eligible_user_ids', (SELECT COALESCE(jsonb_agg(user_id ORDER BY user_id),'[]'::jsonb) FROM public.board_meeting_participants WHERE meeting_id=_b.meeting_id AND public.board_voter_eligible(_b.meeting_id,user_id,_b.deliberation_id)),
    'nomi', (SELECT jsonb_agg(jsonb_build_object('name', display_name, 'vote', vote, 'user_id', user_id, 'participant_id', participant_id,
      'counted',public.board_voter_eligible(_b.meeting_id,user_id,_b.deliberation_id)) ORDER BY display_name, user_id)
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

CREATE OR REPLACE FUNCTION public.board_ballot_cancel(_ballot uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.board_ballots;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_ballots WHERE id = _ballot) FOR UPDATE;
  IF NOT (public.board_is_chair((SELECT meeting_id FROM public.board_ballots WHERE id = _ballot)) OR
    (public.board_chair_user((SELECT meeting_id FROM public.board_ballots WHERE id = _ballot)) IS NULL AND
      (public.is_board_president(auth.uid()) OR public.board_is_minute_taker((SELECT meeting_id FROM public.board_ballots WHERE id = _ballot))))) THEN
    RAISE EXCEPTION 'solo il Presidente può annullare la votazione'; END IF;
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

CREATE OR REPLACE FUNCTION public.board_minutes_ensure(_meeting uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _id uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
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

CREATE OR REPLACE FUNCTION public.board_minutes_save(_meeting uuid, _body text, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _ver int; _vid uuid; _hash text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _source NOT IN ('ia','manuale','rettifica') THEN RAISE EXCEPTION 'origine della versione non valida'; END IF;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
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

CREATE OR REPLACE FUNCTION public.board_minutes_rectify(_minutes uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _name text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_minutes WHERE id = _minutes) FOR UPDATE;
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
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT n.meeting_id FROM public.board_minutes n JOIN public.board_minute_rectifications r ON r.minutes_id = n.id WHERE r.id = _rectification) FOR UPDATE;
  IF _status NOT IN ('accolta','non_accolta') THEN RAISE EXCEPTION 'esito non valido'; END IF;
  SELECT * INTO _r FROM public.board_minute_rectifications WHERE id = _rectification FOR UPDATE;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'rettifica inesistente'; END IF;
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _r.minutes_id;
  IF NOT (public.board_is_chair((SELECT n.meeting_id FROM public.board_minutes n JOIN public.board_minute_rectifications r ON r.minutes_id = n.id WHERE r.id = _rectification)) OR public.board_is_minute_taker(_mn.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono valutare le rettifiche'; END IF;
  IF _r.status <> 'nuova' THEN RAISE EXCEPTION 'rettifica già valutata'; END IF;
  UPDATE public.board_minute_rectifications SET status = _status, handled_by = auth.uid(), handled_at = now() WHERE id = _rectification;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_mn.meeting_id, auth.uid(), 'minutes_rectification_decided',
      jsonb_build_object('minutes_id', _mn.id, 'rectification_id', _rectification, 'outcome', _status, 'name', _r.author_name));
END $$;

CREATE OR REPLACE FUNCTION public.board_minutes_submit_vote(_minutes uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes; _m public.board_meetings; _q jsonb; _v public.board_minute_versions; _b uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_minutes WHERE id = _minutes) FOR UPDATE;
  IF NOT public.board_is_chair((SELECT meeting_id FROM public.board_minutes WHERE id = _minutes)) THEN RAISE EXCEPTION 'solo il Presidente può sottoporre il verbale al voto'; END IF;
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

CREATE OR REPLACE FUNCTION public.board_minutes_signed(_minutes uuid, _storage_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mn public.board_minutes;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_minutes WHERE id = _minutes) FOR UPDATE;
  SELECT * INTO _mn FROM public.board_minutes WHERE id = _minutes FOR UPDATE;
  IF _mn.id IS NULL THEN RAISE EXCEPTION 'verbale inesistente'; END IF;
  IF NOT (public.board_is_chair((SELECT meeting_id FROM public.board_minutes WHERE id = _minutes)) OR public.board_is_minute_taker(_mn.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono registrare la versione firmata'; END IF;
  IF _mn.status <> 'APPROVATO' THEN RAISE EXCEPTION 'la versione firmata si registra solo su un verbale approvato'; END IF;
  IF _storage_path IS NULL OR _storage_path !~ ('^' || _mn.meeting_id::text || '/verbale_firmato-[0-9a-f-]{36}\.[a-z0-9]{2,5}$') THEN
    RAISE EXCEPTION 'percorso del file non valido';
  END IF;
  UPDATE public.board_minutes SET signed_path = _storage_path, signed_at = now(), updated_at = now() WHERE id = _minutes;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_mn.meeting_id, auth.uid(), 'minutes_signed', jsonb_build_object('minutes_id', _minutes, 'path', _storage_path));
END $$;

CREATE OR REPLACE FUNCTION public.board_recording_consent_set(_meeting uuid, _consented boolean, _notice_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.board_meeting_participants;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.board_audio_track_start(_meeting uuid, _kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _p public.board_meeting_participants; _id uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
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
    IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
      RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono caricare la traccia condivisa';
    END IF;
    INSERT INTO public.board_audio_tracks(meeting_id, kind, created_by)
    VALUES (_meeting, 'shared', auth.uid()) RETURNING id INTO _id;
  END IF;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_meeting, auth.uid(), 'audio_track_start', jsonb_build_object('track_id', _id, 'kind', _kind));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.board_audio_track_finish(_track uuid, _storage_path text, _duration integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track) FOR UPDATE;
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id = _track;
  IF NOT FOUND THEN RAISE EXCEPTION 'traccia non trovata'; END IF;
  IF _t.status <> 'in_registrazione' THEN RAISE EXCEPTION 'la traccia è già stata chiusa'; END IF;
  IF _t.kind = 'individual' AND _t.created_by <> auth.uid()
     OR _t.kind = 'shared' AND NOT (public.board_is_chair((SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track)) OR public.board_is_minute_taker(_t.meeting_id)) THEN
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

CREATE OR REPLACE FUNCTION public.board_audio_track_delete(_track uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track) FOR UPDATE;
  SELECT * INTO _t FROM public.board_audio_tracks WHERE id = _track;
  IF NOT FOUND THEN RAISE EXCEPTION 'traccia non trovata'; END IF;
  IF NOT (public.board_is_chair((SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track)) OR public.board_is_minute_taker(_t.meeting_id)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono eliminare una traccia';
  END IF;
  IF _t.status IN ('in_trascrizione','trascritta') THEN
    RAISE EXCEPTION 'una traccia trascritta o in trascrizione non può essere eliminata: resta a registro';
  END IF;
  DELETE FROM public.board_audio_tracks WHERE id = _track;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_t.meeting_id, auth.uid(), 'audio_track_delete', jsonb_build_object('track_id', _track));
END $$;

CREATE OR REPLACE FUNCTION public.board_audio_track_update_service(_track uuid, _status text, _transcript jsonb DEFAULT NULL, _error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.board_audio_tracks; _seg jsonb;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_audio_tracks WHERE id = _track) FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.board_dossier_prepare(_meeting uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _mn public.board_minutes; _snapshot text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
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

CREATE OR REPLACE FUNCTION public.board_dossier_begin_archive(_dossier uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_dossiers; _m public.board_meetings; _prepared jsonb;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_dossiers WHERE id = _dossier) FOR UPDATE;
  SELECT * INTO _d FROM public.board_dossiers WHERE id = _dossier;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'fascicolo inesistente'; END IF;
  IF NOT (public.board_is_chair((SELECT meeting_id FROM public.board_dossiers WHERE id = _dossier)) OR public.board_is_minute_taker(_d.meeting_id)) THEN
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
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_dossiers WHERE id = _dossier) FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.board_document_writable(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.board_meetings m
    WHERE _path ~ ('^' || m.id::text || '/verbale_firmato-[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$')
      AND m.status NOT IN ('ESPORTATO','ARCHIVIATO')
      AND (public.board_is_chair(m.id) OR public.board_is_minute_taker(m.id)))
$$;

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
      (_remove AND t.status NOT IN ('trascritta','in_trascrizione') AND (public.board_is_chair(m.id) OR public.board_is_minute_taker(m.id)))
      OR (NOT _remove AND t.status = 'in_registrazione' AND t.created_by = auth.uid())));
END
$$;

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

REVOKE ALL ON FUNCTION public.board_chair_user(uuid), public.board_is_chair(uuid),
  public.board_chair_assign(uuid,uuid,text,text), public.board_conflict_set(uuid,text,text),
  public.board_voter_eligible(uuid,uuid,uuid), public.board_ballot_quorum(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_chair_user(uuid), public.board_is_chair(uuid),
  public.board_chair_assign(uuid,uuid,text,text), public.board_conflict_set(uuid,text,text),
  public.board_voter_eligible(uuid,uuid,uuid), public.board_ballot_quorum(uuid,uuid) TO authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='board_deliberation_conflicts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.board_deliberation_conflicts;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
