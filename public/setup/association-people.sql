-- Epocar: fondatori, categorie soci e consiglio direttivo dai ruoli utente.
-- Execute once in your external instance SQL editor, AFTER association.sql.
-- New enum values must be committed before use, so they run outside the transaction.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'founder';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ordinary';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supporter';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'president';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vice_president';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretary';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'councillor';

BEGIN;
-- A user can belong to only one member category (founder / ordinary / supporter).
CREATE OR REPLACE FUNCTION public.enforce_single_member_category()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role::text IN ('founder','ordinary','supporter') AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role::text IN ('founder','ordinary','supporter') AND role <> NEW.role
  ) THEN
    RAISE EXCEPTION 'L''utente ha già una categoria socio: rimuovila prima di assegnarne un''altra';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_roles_single_category ON public.user_roles;
CREATE TRIGGER user_roles_single_category BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_member_category();

-- Display order for the public association page (only thing edited from the Associazione tab).
CREATE TABLE IF NOT EXISTS public.association_people_order (
  user_id uuid PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.association_people_order TO authenticated;
GRANT ALL ON public.association_people_order TO service_role;
ALTER TABLE public.association_people_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY people_order_admin ON public.association_people_order FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Public list (founders and board members only): name, avatar path and association roles of people holding an association role.
CREATE OR REPLACE FUNCTION public.list_association_people()
RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, roles text[], sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, p.first_name, p.last_name, p.avatar_url,
         array_agg(ur.role::text ORDER BY ur.role::text),
         COALESCE(o.sort_order, 0)
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.association_people_order o ON o.user_id = ur.user_id
  WHERE ur.role::text IN ('founder','ordinary','supporter','president','vice_president','secretary','councillor')
  GROUP BY ur.user_id, p.first_name, p.last_name, p.avatar_url, o.sort_order
  HAVING bool_or(ur.role::text IN ('founder','president','vice_president','secretary','councillor'))
  ORDER BY COALESCE(o.sort_order, 0), p.last_name NULLS LAST, p.first_name NULLS LAST
$$;
REVOKE ALL ON FUNCTION public.list_association_people() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_association_people() TO anon, authenticated;

-- Profile photos of founders and board members become readable to show them publicly.
-- Ordinary/supporter members without a board role stay private.
CREATE POLICY association_people_avatars_read ON storage.objects FOR SELECT TO anon, authenticated USING (
  bucket_id = 'avatars' AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id::text = (storage.foldername(name))[1]
      AND ur.role::text IN ('founder','president','vice_president','secretary','councillor')));

COMMENT ON TABLE public.association_founders IS 'DEPRECATED: founders now come from user roles (association_people_order)';
COMMIT;
