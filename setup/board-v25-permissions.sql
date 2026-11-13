-- Corregge anche i grant predefiniti presenti sulle installazioni precedenti. Dopo v25.
BEGIN;
REVOKE ALL ON FUNCTION public.board_audio_track_update_service(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.board_audio_track_update_service(uuid,text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
