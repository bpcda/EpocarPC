-- Epocar Tesoreria v4 (anagrafica soci unica): execute AFTER treasury.sql, treasury-v2.sql, treasury-v3.sql. Safe to re-run.
-- * The member register (association_members) is the single source of truth for who is a member.
-- * A member may or may not have a site account (user_id is optional, NULL allowed).
-- * On admission (insert/update) the account is linked by email, without duplicates, and the
--   matching category role (founder / ordinary / supporter) is assigned to the account.
-- * Existing site members (users with a category role) are reconciled once into the register.

BEGIN;

ALTER TABLE public.association_members ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.association_members DROP CONSTRAINT IF EXISTS association_members_email_chk;
ALTER TABLE public.association_members ADD CONSTRAINT association_members_email_chk
  CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
CREATE UNIQUE INDEX IF NOT EXISTS association_members_email_key ON public.association_members (lower(email)) WHERE email IS NOT NULL;

-- Category <-> role mapping
CREATE OR REPLACE FUNCTION public.member_category_role(_category text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _category WHEN 'Fondatore' THEN 'founder' WHEN 'Ordinario' THEN 'ordinary' WHEN 'Sostenitore' THEN 'supporter' END
$$;

-- BEFORE: normalise email and link an existing account found by email (never steal an account linked to another member).
CREATE OR REPLACE FUNCTION public.association_members_link_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  NEW.email := NULLIF(lower(trim(NEW.email)), '');
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT u.id INTO _uid FROM auth.users u
    WHERE lower(u.email) = NEW.email
      AND NOT EXISTS (SELECT 1 FROM public.association_members m WHERE m.user_id = u.id AND m.id <> NEW.id)
    LIMIT 1;
    NEW.user_id := _uid;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS association_members_link_account ON public.association_members;
CREATE TRIGGER association_members_link_account BEFORE INSERT OR UPDATE ON public.association_members
  FOR EACH ROW EXECUTE FUNCTION public.association_members_link_account();

-- AFTER: the linked account gets exactly the category role of the register (other roles untouched).
CREATE OR REPLACE FUNCTION public.association_members_sync_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role text := public.member_category_role(NEW.category);
BEGIN
  IF NEW.user_id IS NULL OR NOT NEW.active THEN RETURN NEW; END IF;
  DELETE FROM public.user_roles WHERE user_id = NEW.user_id
    AND role::text IN ('founder','ordinary','supporter') AND role::text IS DISTINCT FROM _role;
  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, _role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS association_members_sync_role ON public.association_members;
CREATE TRIGGER association_members_sync_role AFTER INSERT OR UPDATE OF user_id, category, active ON public.association_members
  FOR EACH ROW EXECUTE FUNCTION public.association_members_sync_role();

-- Reconciliation: users with a category role but no register entry get one; unlinked entries are linked by email.
CREATE OR REPLACE FUNCTION public.treasury_sync_members()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_treasury_user(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  -- link existing unlinked members by email (trigger does the matching)
  UPDATE public.association_members SET email = email WHERE user_id IS NULL AND email IS NOT NULL;
  INSERT INTO public.association_members (user_id, full_name, email, category, notes)
  SELECT r.user_id,
         COALESCE(NULLIF(trim(COALESCE(p.last_name,'') || ' ' || COALESCE(p.first_name,'')), ''), split_part(u.email, '@', 1), 'Socio'),
         CASE WHEN NOT EXISTS (SELECT 1 FROM public.association_members x WHERE lower(x.email) = lower(u.email)) THEN lower(u.email) END,
         CASE r.role::text WHEN 'founder' THEN 'Fondatore' WHEN 'supporter' THEN 'Sostenitore' ELSE 'Ordinario' END,
         'Importato dal sito: verifica data di ammissione'
  FROM (SELECT DISTINCT ON (user_id) user_id, role FROM public.user_roles
        WHERE role::text IN ('founder','ordinary','supporter') ORDER BY user_id, role::text) r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  WHERE NOT EXISTS (SELECT 1 FROM public.association_members m WHERE m.user_id = r.user_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.treasury_sync_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treasury_sync_members() TO authenticated;

-- Initial reconciliation
SELECT public.treasury_sync_members();

COMMIT;
