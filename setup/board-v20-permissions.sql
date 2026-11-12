-- Correzione dei privilegi predefiniti per installazioni v20 già esistenti.
BEGIN;
REVOKE ALL ON public.board_dossiers FROM authenticated, anon;
GRANT SELECT ON public.board_dossiers TO authenticated;
ALTER FUNCTION public.board_dossier_immutable() SET search_path = public;
REVOKE ALL ON FUNCTION public.board_dossier_immutable(), public.board_archive_guard(),
  public.board_minutes_signature_guard() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
