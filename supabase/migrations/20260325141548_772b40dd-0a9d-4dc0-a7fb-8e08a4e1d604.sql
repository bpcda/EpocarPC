
-- 1. Profiles table for storing first/last name
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  first_name text,
  last_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Gallery images table
CREATE TABLE public.gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  alt_text text,
  sort_order int NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gallery images are viewable by everyone"
  ON public.gallery_images FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can insert gallery images"
  ON public.gallery_images FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update gallery images"
  ON public.gallery_images FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete gallery images"
  ON public.gallery_images FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Add uploaded_by to events and articles
ALTER TABLE public.events ADD COLUMN uploaded_by uuid;
ALTER TABLE public.articles ADD COLUMN uploaded_by uuid;

-- 4. Gallery storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS for gallery bucket
CREATE POLICY "Gallery images are publicly accessible"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'gallery');

CREATE POLICY "Admins can upload gallery images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete gallery images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'admin'));
