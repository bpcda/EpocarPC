
-- Avatars policies
CREATE POLICY "Avatars: users read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars: users insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars: users update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars: users delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Vehicles policies
CREATE POLICY "Vehicles: users read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicles' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vehicles: admins read all"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicles' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vehicles: users insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicles' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vehicles: users update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicles' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vehicles: users delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicles' AND auth.uid()::text = (storage.foldername(name))[1]);
