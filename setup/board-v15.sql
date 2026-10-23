-- Epocar: Consiglio Direttivo — Fase 1 (accessi, convocazioni, ordine del giorno).
-- rev. 1. Da eseguire nell'SQL Editor del progetto esterno, DOPO association-people.sql. Rieseguibile.
-- Componenti del CD = utenti con ruolo president/vice_president/secretary/treasurer/councillor.
-- Il solo ruolo "founder" NON dà accesso. Tutte le scritture passano da funzioni che verificano il ruolo lato server.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_board_member(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role::text IN ('president','vice_president','secretary','treasurer','councillor')) $$;
CREATE OR REPLACE FUNCTION public.is_board_president(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text = 'president') $$;

CREATE TABLE IF NOT EXISTS public.board_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_year integer,
  meeting_number integer,
  scheduled_at timestamptz NOT NULL,
  location text,
  mode text NOT NULL DEFAULT 'presenza' CHECK (mode IN ('presenza','remoto','ibrido')),
  video_link text,
  description text,
  urgency_reason text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONVOCATO','IN_CORSO','VERBALE_IN_REVISIONE','APPROVATO','ESPORTATO','ARCHIVIATO','ANNULLATO','SOSPESO')),
  status_reason text,
  minute_taker_id uuid,
  convened_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_year, meeting_number)
);
CREATE TABLE IF NOT EXISTS public.board_meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('member','guest')),
  user_id uuid,
  display_name text NOT NULL,
  board_roles text[] NOT NULL DEFAULT '{}',
  can_vote boolean NOT NULL DEFAULT false,
  response text NOT NULL DEFAULT 'pending' CHECK (response IN ('pending','confirmed','declined')),
  responded_at timestamptz,
  CHECK (kind = 'member' AND user_id IS NOT NULL OR kind = 'guest' AND can_vote = false)
);
CREATE UNIQUE INDEX IF NOT EXISTS board_participants_member_uq ON public.board_meeting_participants(meeting_id, user_id) WHERE user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.board_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE CASCADE,
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('comunicazione','discussione','deliberazione','approvazione_documento','questione_economica','ammissione_associati','varie')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description text,
  proposal text
);
CREATE TABLE IF NOT EXISTS public.board_meeting_events (
  id bigserial PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES public.board_meetings(id) ON DELETE RESTRICT,
  actor uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.board_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'board_meeting_events è immutabile'; END $$;
DROP TRIGGER IF EXISTS board_events_no_change ON public.board_meeting_events;
CREATE TRIGGER board_events_no_change BEFORE UPDATE OR DELETE ON public.board_meeting_events
  FOR EACH ROW EXECUTE FUNCTION public.board_events_immutable();

-- Visibility: president and admin see everything; board members and participants see non-draft meetings.
CREATE OR REPLACE FUNCTION public.board_can_view(_meeting uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_board_president(auth.uid()) OR public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.board_meetings m WHERE m.id = _meeting AND m.status <> 'DRAFT' AND (
      public.is_board_member(auth.uid()) OR EXISTS (SELECT 1 FROM public.board_meeting_participants p
        WHERE p.meeting_id = m.id AND p.user_id = auth.uid()))) $$;

-- Read-only grants; no INSERT/UPDATE/DELETE for clients.
GRANT SELECT ON public.board_meetings, public.board_meeting_participants, public.board_agenda_items, public.board_meeting_events TO authenticated;
GRANT ALL ON public.board_meetings, public.board_meeting_participants, public.board_agenda_items, public.board_meeting_events TO service_role;
ALTER TABLE public.board_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_meeting_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_meetings_read ON public.board_meetings;
CREATE POLICY board_meetings_read ON public.board_meetings FOR SELECT TO authenticated USING (public.board_can_view(id));
DROP POLICY IF EXISTS board_participants_read ON public.board_meeting_participants;
CREATE POLICY board_participants_read ON public.board_meeting_participants FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_agenda_read ON public.board_agenda_items;
CREATE POLICY board_agenda_read ON public.board_agenda_items FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));
DROP POLICY IF EXISTS board_events_read ON public.board_meeting_events;
CREATE POLICY board_events_read ON public.board_meeting_events FOR SELECT TO authenticated USING (public.board_can_view(meeting_id));

-- Current board members (for the wizard).
CREATE OR REPLACE FUNCTION public.board_list_members()
RETURNS TABLE(user_id uuid, first_name text, last_name text, roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_board_member(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT ur.user_id, p.first_name, p.last_name,
      array_agg(ur.role::text ORDER BY ur.role::text)
    FROM public.user_roles ur LEFT JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role::text IN ('president','vice_president','secretary','treasurer','councillor')
    GROUP BY ur.user_id, p.first_name, p.last_name
    ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST;
END $$;

-- Snapshot every current board member as a voting participant (never removes anyone already invited).
CREATE OR REPLACE FUNCTION public.board_sync_members(_meeting uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.board_meeting_participants(meeting_id, kind, user_id, display_name, board_roles, can_vote)
  SELECT _meeting, 'member', ur.user_id,
         COALESCE(NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),''),'Componente senza nome'),
         array_agg(ur.role::text ORDER BY ur.role::text), true
  FROM public.user_roles ur LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role::text IN ('president','vice_president','secretary','treasurer','councillor')
  GROUP BY ur.user_id, p.first_name, p.last_name
  ON CONFLICT (meeting_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET board_roles = EXCLUDED.board_roles, display_name = EXCLUDED.display_name, can_vote = true, kind = 'member' $$;

-- Create/update a meeting (president only, only before it starts).
CREATE OR REPLACE FUNCTION public.board_save_meeting(_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mid uuid; _st text; _item jsonb; _pos int := 0; _g jsonb; _mt uuid;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può convocare o modificare'; END IF;
  IF (_payload->>'scheduled_at') IS NULL THEN RAISE EXCEPTION 'data e ora obbligatorie'; END IF;
  IF COALESCE(_payload->>'mode','presenza') IN ('remoto','ibrido') AND COALESCE(_payload->>'video_link','') = '' THEN
    RAISE EXCEPTION 'il link alla videoconferenza è obbligatorio per riunioni da remoto o ibride'; END IF;
  IF COALESCE(_payload->>'mode','presenza') IN ('presenza','ibrido') AND COALESCE(_payload->>'location','') = '' THEN
    RAISE EXCEPTION 'il luogo è obbligatorio per riunioni in presenza o ibride'; END IF;
  IF COALESCE(_payload->>'video_link','') <> '' AND (_payload->>'video_link') !~ '^https://' THEN RAISE EXCEPTION 'link non valido'; END IF;
  _mt := NULLIF(_payload->>'minute_taker_id','')::uuid;
  IF _mt IS NOT NULL AND NOT public.is_board_member(_mt) THEN RAISE EXCEPTION 'il verbalizzante deve essere un componente del Consiglio'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.board_meetings(scheduled_at, location, mode, video_link, description, urgency_reason, minute_taker_id, created_by)
    VALUES ((_payload->>'scheduled_at')::timestamptz, NULLIF(_payload->>'location',''), COALESCE(_payload->>'mode','presenza'),
            NULLIF(_payload->>'video_link',''), NULLIF(_payload->>'description',''), NULLIF(_payload->>'urgency_reason',''), _mt, auth.uid())
    RETURNING id INTO _mid;
    INSERT INTO public.board_meeting_events(meeting_id, actor, action) VALUES (_mid, auth.uid(), 'created');
  ELSE
    SELECT status INTO _st FROM public.board_meetings WHERE id = _id FOR UPDATE;
    IF _st IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
    IF _st NOT IN ('DRAFT','CONVOCATO','SOSPESO') THEN RAISE EXCEPTION 'la riunione non è più modificabile (stato %)', _st; END IF;
    UPDATE public.board_meetings SET scheduled_at = (_payload->>'scheduled_at')::timestamptz, location = NULLIF(_payload->>'location',''),
      mode = COALESCE(_payload->>'mode','presenza'), video_link = NULLIF(_payload->>'video_link',''),
      description = NULLIF(_payload->>'description',''), urgency_reason = NULLIF(_payload->>'urgency_reason',''),
      minute_taker_id = _mt, updated_at = now() WHERE id = _id;
    _mid := _id;
    INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail) VALUES (_mid, auth.uid(), 'updated', jsonb_build_object('status', _st));
  END IF;

  DELETE FROM public.board_agenda_items WHERE meeting_id = _mid;
  FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'agenda','[]')) LOOP
    _pos := _pos + 1;
    INSERT INTO public.board_agenda_items(meeting_id, position, kind, title, description, proposal)
    VALUES (_mid, _pos, _item->>'kind', trim(_item->>'title'), NULLIF(_item->>'description',''), NULLIF(_item->>'proposal',''));
  END LOOP;

  DELETE FROM public.board_meeting_participants WHERE meeting_id = _mid AND kind = 'guest';
  FOR _g IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'guests','[]')) LOOP
    IF COALESCE(trim(_g->>'name'),'') = '' THEN RAISE EXCEPTION 'nome invitato obbligatorio'; END IF;
    INSERT INTO public.board_meeting_participants(meeting_id, kind, display_name, can_vote) VALUES (_mid, 'guest', trim(_g->>'name'), false);
  END LOOP;
  PERFORM public.board_sync_members(_mid);
  RETURN _mid;
END $$;

-- Status changes allowed in Phase 1.
CREATE OR REPLACE FUNCTION public.board_set_status(_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _n int;
BEGIN
  IF NOT public.is_board_president(auth.uid()) THEN RAISE EXCEPTION 'solo il Presidente può cambiare lo stato'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  IF NOT ((_m.status = 'DRAFT' AND _status IN ('CONVOCATO','ANNULLATO'))
       OR (_m.status = 'CONVOCATO' AND _status IN ('ANNULLATO','SOSPESO'))
       OR (_m.status = 'SOSPESO' AND _status IN ('CONVOCATO','ANNULLATO'))) THEN
    RAISE EXCEPTION 'passaggio di stato non consentito: % → %', _m.status, _status; END IF;
  IF _status IN ('ANNULLATO','SOSPESO') AND COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivazione obbligatoria'; END IF;
  IF _status = 'CONVOCATO' THEN
    IF NOT EXISTS (SELECT 1 FROM public.board_agenda_items WHERE meeting_id = _id) THEN RAISE EXCEPTION 'ordine del giorno vuoto'; END IF;
    PERFORM public.board_sync_members(_id);
    IF _m.meeting_number IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('board_meeting_number'));
      SELECT COALESCE(max(meeting_number),0)+1 INTO _n FROM public.board_meetings
        WHERE meeting_year = extract(year FROM _m.scheduled_at AT TIME ZONE 'Europe/Rome')::int;
      UPDATE public.board_meetings SET meeting_year = extract(year FROM _m.scheduled_at AT TIME ZONE 'Europe/Rome')::int,
        meeting_number = _n, convened_at = now() WHERE id = _id;
    END IF;
  END IF;
  UPDATE public.board_meetings SET status = _status, status_reason = NULLIF(trim(COALESCE(_reason,'')),''), updated_at = now() WHERE id = _id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
  VALUES (_id, auth.uid(), 'status', jsonb_build_object('from', _m.status, 'to', _status, 'reason', _reason));
END $$;

-- A participant confirms or declines their own attendance.
CREATE OR REPLACE FUNCTION public.board_respond(_id uuid, _response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _response NOT IN ('confirmed','declined') THEN RAISE EXCEPTION 'risposta non valida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_meetings WHERE id = _id AND status IN ('CONVOCATO','SOSPESO')) THEN
    RAISE EXCEPTION 'la riunione non accetta conferme'; END IF;
  UPDATE public.board_meeting_participants SET response = _response, responded_at = now()
    WHERE meeting_id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'non sei tra i convocati'; END IF;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail) VALUES (_id, auth.uid(), 'response', jsonb_build_object('response', _response));
END $$;

REVOKE ALL ON FUNCTION public.board_sync_members(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_list_members(), public.board_save_meeting(uuid,jsonb), public.board_set_status(uuid,text,text),
  public.board_respond(uuid,text), public.board_can_view(uuid), public.is_board_member(uuid), public.is_board_president(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_list_members(), public.board_save_meeting(uuid,jsonb), public.board_set_status(uuid,text,text),
  public.board_respond(uuid,text), public.board_can_view(uuid), public.is_board_member(uuid), public.is_board_president(uuid) TO authenticated;
COMMIT;
