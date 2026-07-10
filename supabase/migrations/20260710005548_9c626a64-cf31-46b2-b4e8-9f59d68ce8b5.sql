
-- Helper: allowed extensions for uploads to the two new buckets
CREATE OR REPLACE FUNCTION public.is_allowed_upload_ext(_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(_name, '^.*\.', '')) IN
    ('pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'heic')
$$;

-- ============================================================
-- event-documents  (admin-uploaded, readable by everyone via signed URLs)
-- ============================================================

CREATE POLICY "event-documents public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'event-documents');

CREATE POLICY "event-documents admin insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-documents'
  AND public.has_role(auth.uid(), 'admin')
  AND public.is_allowed_upload_ext(name)
);

CREATE POLICY "event-documents admin update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-documents' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (
  bucket_id = 'event-documents'
  AND public.has_role(auth.uid(), 'admin')
  AND public.is_allowed_upload_ext(name)
);

CREATE POLICY "event-documents admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-documents' AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- registration-uploads  (user-uploaded proof/signed docs, private)
-- Path layout: <user_id>/<event_id>/<field_id>-<timestamp>.<ext>
-- ============================================================

CREATE POLICY "registration-uploads owner select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'registration-uploads'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "registration-uploads owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'registration-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_allowed_upload_ext(name)
);

CREATE POLICY "registration-uploads owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'registration-uploads'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);
