-- EPOCAR · avatar-cleanup.sql (rieseguibile)
-- La foto Google non è mai l'avatar dell'app. Azzera SOLO avatar_url che sono URL esterni
-- (es. googleusercontent.com); i percorsi del bucket "avatars" (user_id/file) restano intatti.
BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
UPDATE public.profiles SET avatar_url = NULL WHERE avatar_url ~* '^(https?:|data:)';
UPDATE storage.buckets SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'] WHERE id = 'avatars';
COMMIT;
