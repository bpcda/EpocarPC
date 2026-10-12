-- Epocar: execute once in your external instance SQL editor.
-- Requires existing public.has_role(uuid, app_role) and admin/staff roles.
BEGIN;
CREATE TABLE public.association_documents (
  kind text PRIMARY KEY CHECK (kind IN ('statute','membership_form')),
  path text NOT NULL CHECK (path ~ '^(statute|membership_form)/[0-9a-f-]+\.(pdf|docx|jpg|jpeg|png|webp)$' AND split_part(path,'/',1) = kind),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.association_documents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.association_documents TO authenticated;
GRANT ALL ON public.association_documents TO service_role;
ALTER TABLE public.association_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY association_docs_read ON public.association_documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY association_docs_admin ON public.association_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.association_founders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  biography text NOT NULL DEFAULT '' CHECK (char_length(biography) <= 1000),
  photo_path text CHECK (photo_path ~ '^founders/[0-9a-f-]+\.(jpg|jpeg|png|webp)$'),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.association_founders TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.association_founders TO authenticated;
GRANT ALL ON public.association_founders TO service_role;
ALTER TABLE public.association_founders ENABLE ROW LEVEL SECURITY;
CREATE POLICY association_founders_read ON public.association_founders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY association_founders_admin ON public.association_founders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.membership_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (char_length(email) <= 255 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  file_path text NOT NULL UNIQUE CHECK (file_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(pdf|docx|jpg|jpeg|png|webp)$' AND split_part(file_path,'/',1) = user_id::text),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  acknowledged boolean NOT NULL CHECK (acknowledged = true),
  statute_path text NOT NULL,
  form_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.membership_applications TO authenticated;
GRANT ALL ON public.membership_applications TO service_role;
ALTER TABLE public.membership_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON public.membership_applications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY membership_submit ON public.membership_applications FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='statute' AND path=statute_path)
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='membership_form' AND path=form_path)
  AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='membership-submissions' AND name=file_path)
);

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES
('association-documents','association-documents',true,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']),
('association-media','association-media',true,10485760,ARRAY['image/jpeg','image/png','image/webp']),
('membership-submissions','membership-submissions',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY association_assets_read ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id IN ('association-documents','association-media'));
CREATE POLICY association_assets_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 public.has_role(auth.uid(),'admin') AND (
 (bucket_id='association-documents' AND name ~ '^(statute|membership_form)/[0-9a-f-]+\.(pdf|docx|jpg|jpeg|png|webp)$') OR
 (bucket_id='association-media' AND name ~ '^founders/[0-9a-f-]+\.(jpg|jpeg|png|webp)$')));
CREATE POLICY association_assets_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('association-documents','association-media') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY membership_files_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='membership-submissions' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
CREATE OR REPLACE FUNCTION public.membership_upload_count(_uid uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT count(*) FROM storage.objects WHERE bucket_id='membership-submissions' AND (storage.foldername(name))[1]=_uid::text $$;
CREATE POLICY membership_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='membership-submissions' AND (storage.foldername(name))[1]=auth.uid()::text
 AND name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(pdf|docx|jpg|jpeg|png|webp)$'
 AND public.membership_upload_count(auth.uid()) < 3
 AND NOT EXISTS (SELECT 1 FROM public.membership_applications WHERE user_id=auth.uid())
 AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='statute')
 AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='membership_form'));
CREATE POLICY membership_files_cleanup ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='membership-submissions' AND (storage.foldername(name))[1]=auth.uid()::text
 AND NOT EXISTS (SELECT 1 FROM public.membership_applications WHERE file_path=name));
COMMIT;
-- No membership UPDATE/DELETE for app users, admins or staff: submitted files are preserved.