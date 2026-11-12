-- Consiglio Direttivo — integrazione, passo 1. Installare DOPO board-v15…v20.
-- Approvazione nella stessa seduta; chiusura senza approvazione ammessa con motivazione.
BEGIN;

CREATE OR REPLACE FUNCTION public.board_session_action(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _next text; _approved boolean := false;
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

-- Il resoconto non approvato resta redigibile; un atto approvato non si rettifica nella seduta chiusa.
CREATE OR REPLACE FUNCTION public.board_minutes_closed_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _meeting uuid; _approved boolean; _ended timestamptz;
BEGIN
  SELECT meeting_id, status = 'APPROVATO' INTO _meeting, _approved FROM public.board_minutes WHERE id = NEW.minutes_id;
  SELECT ended_at INTO _ended FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _ended IS NOT NULL AND (_approved OR NEW.source = 'rettifica') THEN
    RAISE EXCEPTION 'seduta chiusa: le rettifiche si trattano in una nuova seduta'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS board_minutes_closed_guard ON public.board_minute_versions;
CREATE TRIGGER board_minutes_closed_guard BEFORE INSERT ON public.board_minute_versions
  FOR EACH ROW EXECUTE FUNCTION public.board_minutes_closed_guard();

REVOKE ALL ON FUNCTION public.board_minutes_closed_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_session_action(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_session_action(uuid,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
