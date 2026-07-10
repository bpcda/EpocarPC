
CREATE TABLE public.role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid NOT NULL,
  target_user uuid NOT NULL,
  role app_role NOT NULL,
  previous_state text NOT NULL CHECK (previous_state IN ('present','absent')),
  new_state text NOT NULL CHECK (new_state IN ('present','absent')),
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only SELECT + INSERT are ever granted. No UPDATE, no DELETE for any app role.
-- Only a database superuser (sys admin via direct SQL) can delete rows.
GRANT SELECT ON public.role_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.role_audit_log TO service_role;

ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log
CREATE POLICY "Admins can read role audit log"
ON public.role_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Belt-and-suspenders: even if privileges were mistakenly granted later,
-- block any UPDATE or DELETE issued via a non-superuser connection.
CREATE OR REPLACE FUNCTION public.prevent_role_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'role_audit_log is immutable: rows cannot be % via the application', TG_OP;
END;
$$;

CREATE TRIGGER role_audit_log_no_update
BEFORE UPDATE ON public.role_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_audit_mutation();

CREATE TRIGGER role_audit_log_no_delete
BEFORE DELETE ON public.role_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_audit_mutation();

-- Update the role-mutation function to write an audit entry atomically
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _had boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _role = 'admin' AND _grant = false AND _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove your own admin role';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  ) INTO _had;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = _role;
  END IF;

  -- Only log real state transitions
  IF (_grant AND NOT _had) OR ((NOT _grant) AND _had) THEN
    INSERT INTO public.role_audit_log (
      changed_by, target_user, role, previous_state, new_state, action
    ) VALUES (
      auth.uid(),
      _user_id,
      _role,
      CASE WHEN _had THEN 'present' ELSE 'absent' END,
      CASE WHEN _grant THEN 'present' ELSE 'absent' END,
      CASE WHEN _grant THEN 'grant' ELSE 'revoke' END
    );
  END IF;
END;
$$;

-- Helper for the UI: list audit entries with resolved names/emails for admins
CREATE OR REPLACE FUNCTION public.admin_list_role_audit(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  action text,
  role app_role,
  previous_state text,
  new_state text,
  changed_by uuid,
  changed_by_email text,
  changed_by_name text,
  target_user uuid,
  target_email text,
  target_name text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      a.id,
      a.created_at,
      a.action,
      a.role,
      a.previous_state,
      a.new_state,
      a.changed_by,
      cu.email::text AS changed_by_email,
      NULLIF(TRIM(COALESCE(cp.first_name,'') || ' ' || COALESCE(cp.last_name,'')), '') AS changed_by_name,
      a.target_user,
      tu.email::text AS target_email,
      NULLIF(TRIM(COALESCE(tp.first_name,'') || ' ' || COALESCE(tp.last_name,'')), '') AS target_name
    FROM public.role_audit_log a
    LEFT JOIN auth.users cu ON cu.id = a.changed_by
    LEFT JOIN public.profiles cp ON cp.user_id = a.changed_by
    LEFT JOIN auth.users tu ON tu.id = a.target_user
    LEFT JOIN public.profiles tp ON tp.user_id = a.target_user
  ),
  counted AS (SELECT (SELECT count(*) FROM base) AS total_count)
  SELECT b.*, c.total_count
  FROM base b, counted c
  ORDER BY b.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END;
$$;
