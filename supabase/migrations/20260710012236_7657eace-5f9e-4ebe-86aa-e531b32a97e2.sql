
-- List users with search + pagination (admin only)
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT '',
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  created_at timestamptz,
  roles app_role[],
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      u.id AS user_id,
      u.email::text AS email,
      p.first_name,
      p.last_name,
      u.created_at,
      COALESCE(
        (SELECT array_agg(ur.role ORDER BY ur.role)
         FROM public.user_roles ur
         WHERE ur.user_id = u.id),
        ARRAY[]::app_role[]
      ) AS roles
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE
      _search = ''
      OR u.email ILIKE '%' || _search || '%'
      OR COALESCE(p.first_name, '') ILIKE '%' || _search || '%'
      OR COALESCE(p.last_name, '')  ILIKE '%' || _search || '%'
      OR (COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) ILIKE '%' || _search || '%'
  ),
  counted AS (
    SELECT (SELECT count(*) FROM base) AS total_count
  )
  SELECT b.user_id, b.email, b.first_name, b.last_name, b.created_at, b.roles, c.total_count
  FROM base b, counted c
  ORDER BY b.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int) TO authenticated;

-- Set (grant/revoke) a role on a user (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  _user_id uuid,
  _role app_role,
  _grant boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Prevent an admin from removing their own admin role (avoid lockout)
  IF _role = 'admin' AND _grant = false AND _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove your own admin role';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role, boolean) TO authenticated;
