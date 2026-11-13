-- Stanza audio/video privata: l'accesso non attribuisce presenza o diritto al voto. Dopo v25.
BEGIN;
CREATE TABLE IF NOT EXISTS public.board_room_health(id boolean PRIMARY KEY DEFAULT true CHECK(id),checked_at timestamptz NOT NULL);
ALTER TABLE public.board_room_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_room_health FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.board_room_health TO service_role;

CREATE OR REPLACE FUNCTION public.board_room_access(_meeting uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _p public.board_meeting_participants;
BEGIN
  IF NOT public.is_board_member(auth.uid()) THEN RAISE EXCEPTION 'carica consiliare corrente obbligatoria'; END IF;
  SELECT p.* INTO _p FROM public.board_meeting_participants p JOIN public.board_meetings m ON m.id=p.meeting_id
    WHERE p.meeting_id=_meeting AND p.user_id=auth.uid() AND p.kind='member' AND m.ended_at IS NULL AND m.status IN ('CONVOCATO','IN_CORSO','SOSPESO');
  IF _p.id IS NULL THEN RAISE EXCEPTION 'stanza non disponibile'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.board_room_health WHERE id=true AND checked_at>now()-interval '20 seconds') THEN RAISE EXCEPTION 'server audio/video non attivo'; END IF;
  RETURN jsonb_build_object('room','board-'||_meeting::text,'identity',auth.uid(),'name',_p.display_name);
END $$;

-- Il supervisore usa questa fotografia ogni 5 secondi e rimuove accessi decaduti.
CREATE OR REPLACE FUNCTION public.board_room_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('room','board-'||m.id::text,'identity',p.user_id))
    FROM public.board_meetings m JOIN public.board_meeting_participants p ON p.meeting_id=m.id
    WHERE m.ended_at IS NULL AND m.status IN ('CONVOCATO','IN_CORSO','SOSPESO') AND p.kind='member' AND public.is_board_member(p.user_id)),'[]');
END $$;
REVOKE ALL ON FUNCTION public.board_room_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.board_room_state() TO service_role;
REVOKE ALL ON FUNCTION public.board_room_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.board_room_access(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
