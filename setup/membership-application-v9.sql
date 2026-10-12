-- EPOCAR · membership-application-v9.sql (rieseguibile; eseguire dopo v7/v8)
-- La domanda ELETTRONICA non dipende dal modulo PDF né dallo statuto caricato:
-- form_path/statute_path diventano facoltativi; se indicati devono puntare a documenti esistenti.
-- La domanda con modulo caricato ('upload') continua a richiedere il modulo pubblicato.
BEGIN;
ALTER TABLE public.membership_applications ALTER COLUMN form_path DROP NOT NULL;
ALTER TABLE public.membership_applications ALTER COLUMN statute_path DROP NOT NULL;

DROP POLICY IF EXISTS membership_submit ON public.membership_applications;
CREATE POLICY membership_submit ON public.membership_applications FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND status IN ('draft','submitted') AND member_id IS NULL AND decided_at IS NULL
  AND treasury_member_id IS NULL AND approved_at IS NULL AND rejected_at IS NULL AND reviewed_at IS NULL
  AND public_status_message IS NULL
  AND (statute_path IS NULL OR EXISTS (SELECT 1 FROM public.association_documents WHERE kind='statute' AND path=statute_path))
  AND (form_path IS NULL OR EXISTS (SELECT 1 FROM public.association_documents WHERE kind='membership_form' AND path=form_path))
  AND (application_kind = 'electronic' OR form_path IS NOT NULL)
  AND (file_path IS NULL OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='membership-submissions' AND name=file_path))
);
COMMIT;
