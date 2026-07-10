
-- Read-only dashboard access for staff (in addition to existing admin policies)

-- events
CREATE POLICY "Staff can view all events" ON public.events
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

-- articles
CREATE POLICY "Staff can view all articles" ON public.articles
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

-- event_registrations
CREATE POLICY "Staff view all registrations" ON public.event_registrations
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

-- profiles (needed to resolve user_id -> name in registrations tab)
CREATE POLICY "Staff can read all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

-- vehicles (needed to resolve vehicle_id -> vehicle details in registrations tab)
CREATE POLICY "Staff can view all vehicles" ON public.vehicles
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

-- gallery_images: full CRUD for staff
CREATE POLICY "Staff can insert gallery images" ON public.gallery_images
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can update gallery images" ON public.gallery_images
  FOR UPDATE USING (public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can delete gallery images" ON public.gallery_images
  FOR DELETE USING (public.has_role(auth.uid(), 'staff'));

-- storage: gallery bucket upload/update/delete for staff
CREATE POLICY "Staff can upload gallery images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can update gallery images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can delete gallery images" ON storage.objects
  FOR DELETE USING (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'staff'));

-- storage: registration-uploads read access for staff (to download form-submitted files)
CREATE POLICY "Staff can read registration uploads" ON storage.objects
  FOR SELECT USING (bucket_id = 'registration-uploads' AND public.has_role(auth.uid(), 'staff'));
