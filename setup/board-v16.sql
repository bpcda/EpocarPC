-- EPOCAR — Consiglio Direttivo, Fase 2. Installazione manuale DOPO board-v15.sql.
-- Nessun accesso al progetto esterno da questo workspace. Rieseguibile, transazionale.
BEGIN;

ALTER TABLE public.board_meetings ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.board_meetings ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.board_meetings ADD COLUMN IF NOT EXISTS active_agenda_id uuid;
ALTER TABLE public.board_meeting_participants ADD COLUMN IF NOT EXISTS attendance_requested_at timestamptz;
ALTER TABLE public.board_meeting_participants ADD COLUMN IF NOT EXISTS present boolean NOT NULL DEFAULT false;
ALTER TABLE public.board_meeting_participants ADD COLUMN IF NOT EXISTS attendance_mode text CHECK (attendance_mode IN ('presenza','remoto'));
ALTER TABLE public.board_meeting_participants ADD COLUMN IF NOT EXISTS identified_by uuid;
ALTER TABLE public.board_meeting_participants ADD COLUMN IF NOT EXISTS identified_at timestamptz;
ALTER TABLE public.board_meeting_participants ADD COLUMN IF NOT EXISTS attendance_note text;
ALTER TABLE public.board_agenda_items ADD COLUMN IF NOT EXISTS discussion_status text NOT NULL DEFAULT 'pending' CHECK (discussion_status IN ('pending','current','discussed'));

-- Controllo attendibile: cariche attuali, mai risposta RSVP o connessione tecnica.
CREATE OR REPLACE FUNCTION public.board_quorum(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _total int; _present int;
BEGIN
  IF NOT public.board_can_view(_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT count(DISTINCT user_id) INTO _total FROM public.user_roles
    WHERE role::text IN ('president','vice_president','secretary','treasurer','councillor');
  SELECT count(DISTINCT user_id) INTO _present FROM public.board_meeting_participants
    WHERE meeting_id = _id AND kind = 'member' AND can_vote AND present
      AND identified_at IS NOT NULL AND public.is_board_member(user_id);
  RETURN jsonb_build_object('total',_total,'present',_present,'required',(_total / 2)+1,
    'met',_total > 0 AND _present >= (_total / 2)+1);
END $$;

CREATE OR REPLACE FUNCTION public.board_attendance_request(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL OR _m.status NOT IN ('CONVOCATO','IN_CORSO','SOSPESO') OR _m.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'la seduta non accetta richieste di presenza'; END IF;
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.board_meeting_participants SET attendance_requested_at = now()
    WHERE meeting_id = _id AND user_id = auth.uid() AND NOT present;
  IF NOT FOUND THEN RAISE EXCEPTION 'partecipante assente o presenza già confermata'; END IF;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail)
    VALUES (_id,auth.uid(),'attendance_requested',jsonb_build_object('user_id',auth.uid()));
END $$;

-- Presidente o verbalizzante attualmente in carica certificano la presenza effettiva.
-- _verified: identificazione + capacità di seguire/intervenire/consultare i documenti,
-- non una semplice connessione. Nota obbligatoria per documentare la verifica.
CREATE OR REPLACE FUNCTION public.board_attendance_set(_id uuid, _participant uuid, _present boolean,
  _mode text DEFAULT NULL, _verified boolean DEFAULT false, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _p public.board_meeting_participants;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL OR _m.status NOT IN ('CONVOCATO','IN_CORSO','SOSPESO') OR _m.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'presenze non modificabili'; END IF;
  IF NOT (public.is_board_president(auth.uid()) OR
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
DECLARE _m public.board_meetings; _next text;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  IF _action = 'open' AND _m.status = 'CONVOCATO' AND _m.started_at IS NULL THEN
    PERFORM public.board_sync_members(_id);
    _next := 'IN_CORSO';
    UPDATE public.board_meetings SET started_at = now() WHERE id = _id;
  ELSIF _action = 'suspend' AND _m.status = 'IN_CORSO' THEN
    IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivazione obbligatoria'; END IF;
    _next := 'SOSPESO';
  ELSIF _action = 'resume' AND _m.status = 'SOSPESO' AND _m.started_at IS NOT NULL AND _m.ended_at IS NULL THEN
    _next := 'IN_CORSO';
  ELSIF _action = 'close' AND _m.status IN ('IN_CORSO','SOSPESO') AND _m.started_at IS NOT NULL AND _m.ended_at IS NULL THEN
    _next := 'VERBALE_IN_REVISIONE';
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
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente'; END IF;
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

-- Protegge anche i vecchi percorsi della Fase 1 durante una sospensione live.
-- I corpi originali restano privati; wrapper con lock eseguiti anche dai vecchi client.
DO $$ BEGIN
  IF to_regprocedure('public.board_save_meeting_phase1(uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.board_save_meeting(uuid,jsonb) RENAME TO board_save_meeting_phase1;
  END IF;
  IF to_regprocedure('public.board_set_status_phase1(uuid,text,text)') IS NULL THEN
    ALTER FUNCTION public.board_set_status(uuid,text,text) RENAME TO board_set_status_phase1;
  END IF;
  IF to_regprocedure('public.board_respond_phase1(uuid,text)') IS NULL THEN
    ALTER FUNCTION public.board_respond(uuid,text) RENAME TO board_respond_phase1;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.board_save_meeting_phase1(uuid,jsonb), public.board_set_status_phase1(uuid,text,text),
  public.board_respond_phase1(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.board_before_start(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _started timestamptz;
BEGIN
  SELECT started_at INTO _started FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _started IS NOT NULL THEN RAISE EXCEPTION 'la seduta è già iniziata'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.board_before_start(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.board_save_meeting(_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.board_before_start(_id);
  RETURN public.board_save_meeting_phase1(_id,_payload);
END $$;
CREATE OR REPLACE FUNCTION public.board_set_status(_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.board_before_start(_id);
  PERFORM public.board_set_status_phase1(_id,_status,_reason);
END $$;
CREATE OR REPLACE FUNCTION public.board_respond(_id uuid, _response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.board_before_start(_id);
  PERFORM public.board_respond_phase1(_id,_response);
END $$;

REVOKE ALL ON FUNCTION public.board_quorum(uuid), public.board_attendance_request(uuid),
  public.board_attendance_set(uuid,uuid,boolean,text,boolean,text), public.board_session_action(uuid,text,text),
  public.board_agenda_select(uuid,uuid), public.board_save_meeting(uuid,jsonb), public.board_set_status(uuid,text,text),
  public.board_respond(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_quorum(uuid), public.board_attendance_request(uuid),
  public.board_attendance_set(uuid,uuid,boolean,text,boolean,text), public.board_session_action(uuid,text,text),
  public.board_agenda_select(uuid,uuid), public.board_save_meeting(uuid,jsonb), public.board_set_status(uuid,text,text),
  public.board_respond(uuid,text) TO authenticated;

-- Solo eventi delle tabelle già protette da RLS, nessun broadcast pubblico/presenza spoofabile.
DO $$ DECLARE _table text; BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH _table IN ARRAY ARRAY['board_meetings','board_meeting_participants','board_agenda_items','board_meeting_events'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _table) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',_table);
      END IF;
    END LOOP;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;