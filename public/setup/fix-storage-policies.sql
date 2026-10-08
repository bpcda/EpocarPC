-- EPOCAR · fix-storage-policies.sql (rieseguibile)
-- Corregge l'errore "DatabaseInvalidObjectDefinition" sui caricamenti:
-- la regola di upload dei moduli leggeva storage.objects dentro una regola di storage.objects
-- (ricorsione infinita, codice 42P17), bloccando OGNI caricamento, anche dello statuto.
BEGIN;

CREATE OR REPLACE FUNCTION public.membership_upload_count(_uid uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT count(*) FROM storage.objects
  WHERE bucket_id = 'membership-submissions' AND (storage.foldername(name))[1] = _uid::text
$$;
REVOKE ALL ON FUNCTION public.membership_upload_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.membership_upload_count(uuid) TO authenticated;

DROP POLICY IF EXISTS membership_files_insert ON storage.objects;
CREATE POLICY membership_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'membership-submissions'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(pdf|docx|jpg|jpeg|png|webp)$'
  AND public.membership_upload_count(auth.uid()) < 3
  AND NOT EXISTS (SELECT 1 FROM public.membership_applications WHERE user_id = auth.uid() AND status <> 'draft')
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind = 'membership_form')
);

COMMIT;
