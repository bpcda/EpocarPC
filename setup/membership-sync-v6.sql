-- Epocar v6 — Separazione sito pubblico / Tesoreria privata. Execute AFTER association.sql and treasury-v5.sql.
-- Safe to re-run. Never deletes applications, history or members.
--
-- * The public site (browser) may only: create its own application, edit its own draft, submit it, read its own status.
-- * Every decision (review / approval / rejection / cancellation), the treasury member id, the card number,
--   admission date, category and fee status come ONLY from the private Treasury through the treasury-sync
--   Edge Function, which calls the service_role-only functions below.
-- * The Dashboard approval (membership_decide) is no longer callable from the browser: a single authority decides.
-- * member_public_status is the limited, per-user projection shown in the Area Socio (no finances, no other members).

BEGIN;

-- 1) Applications: extra states and Treasury-governed columns --------------------------------------------
ALTER TABLE public.membership_applications DROP CONSTRAINT IF EXISTS membership_applications_status_chk;
ALTER TABLE public.membership_applications ADD CONSTRAINT membership_applications_status_chk
  CHECK (status IN ('draft','submitted','review','approved','rejected','cancelled'));
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS treasury_member_id uuid;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS public_status_message text CHECK (char_length(public_status_message) <= 500);
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- One Treasury member can never come from two applications (no duplicate memberships).
CREATE UNIQUE INDEX IF NOT EXISTS membership_applications_treasury_member_uq
  ON public.membership_applications (treasury_member_id) WHERE treasury_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS membership_applications_pending_idx
  ON public.membership_applications (status, submitted_at, id);
-- Historical decisions taken in the Dashboard (v5) keep their dates.
UPDATE public.membership_applications SET approved_at = decided_at WHERE status='approved' AND approved_at IS NULL AND decided_at IS NOT NULL;
UPDATE public.membership_applications SET rejected_at = decided_at WHERE status='rejected' AND rejected_at IS NULL AND decided_at IS NOT NULL;

-- Browser column privileges: only applicant-owned fields (status limited by policy + guard below).
REVOKE UPDATE ON public.membership_applications FROM authenticated;
GRANT UPDATE (full_name, email, file_path, filename, status, requested_category) ON public.membership_applications TO authenticated;
GRANT ALL ON public.membership_applications TO service_role;

DROP POLICY IF EXISTS membership_submit ON public.membership_applications;
CREATE POLICY membership_submit ON public.membership_applications FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND status IN ('draft','submitted') AND member_id IS NULL AND decided_at IS NULL
  AND treasury_member_id IS NULL AND approved_at IS NULL AND rejected_at IS NULL AND reviewed_at IS NULL
  AND public_status_message IS NULL
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='statute' AND path=statute_path)
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='membership_form' AND path=form_path)
  AND (file_path IS NULL OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='membership-submissions' AND name=file_path))
);
DROP POLICY IF EXISTS membership_draft_update ON public.membership_applications;
CREATE POLICY membership_draft_update ON public.membership_applications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft')
  WITH CHECK (user_id = auth.uid() AND status IN ('draft','submitted')
    AND (file_path IS NULL OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='membership-submissions' AND name=file_path)));
-- Reading: own application; staff and board/admin keep read-only visibility in the Dashboard.
DROP POLICY IF EXISTS membership_read ON public.membership_applications;
CREATE POLICY membership_read ON public.membership_applications FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.has_role(auth.uid(),'staff') OR public.can_manage_admissions(auth.uid()));

-- Defence in depth: whatever the grants, a non-service caller can never touch Treasury-governed data.
CREATE OR REPLACE FUNCTION public.membership_applications_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN
    NEW.updated_at := now(); RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','submitted') OR NEW.treasury_member_id IS NOT NULL OR NEW.member_id IS NOT NULL
       OR NEW.approved_at IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.reviewed_at IS NOT NULL
       OR NEW.cancelled_at IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.public_status_message IS NOT NULL THEN
      RAISE EXCEPTION 'Campi riservati alla Tesoreria' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD.status <> 'draft' OR NEW.status NOT IN ('draft','submitted')
       OR NEW.treasury_member_id IS DISTINCT FROM OLD.treasury_member_id OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at OR NEW.public_status_message IS DISTINCT FROM OLD.public_status_message
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Campi riservati alla Tesoreria' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS membership_applications_guard ON public.membership_applications;
CREATE TRIGGER membership_applications_guard BEFORE INSERT OR UPDATE ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.membership_applications_guard();

-- The Dashboard no longer decides: the function stays (history intact) but the browser cannot call it.
DO $$ BEGIN
  IF to_regprocedure('public.membership_decide(uuid,text,text,date,text,date,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.membership_decide(uuid,text,text,date,text,date,text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 2) Area Socio projection (one row per linked account, written only by the Treasury sync) ---------------
CREATE TABLE IF NOT EXISTS public.member_public_status (
  treasury_member_id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  application_id uuid UNIQUE REFERENCES public.membership_applications(id),
  membership_status text NOT NULL CHECK (membership_status IN ('active','suspended','ceased')),
  category text NOT NULL CHECK (category IN ('Fondatore','Ordinario','Sostenitore','Onorario')),
  card_number integer CHECK (card_number > 0),
  admission_date date,
  membership_year integer CHECK (membership_year BETWEEN 2000 AND 2100),
  fee_status text CHECK (fee_status IN ('paid','partial','due','exempt')),
  treasury_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS member_public_status_card_uq ON public.member_public_status (card_number) WHERE card_number IS NOT NULL;
GRANT SELECT ON public.member_public_status TO authenticated;
GRANT ALL ON public.member_public_status TO service_role;
ALTER TABLE public.member_public_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mps_read_own ON public.member_public_status;
CREATE POLICY mps_read_own ON public.member_public_status FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3) Sync request log (idempotency + access log) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.treasury_sync_requests (
  idempotency_key text PRIMARY KEY CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  action text NOT NULL,
  application_id uuid,
  treasury_member_id uuid,
  payload_hash text NOT NULL,
  response jsonb NOT NULL,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.treasury_sync_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  action text,
  http_status integer NOT NULL,
  request_id text,
  authorized boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS treasury_sync_access_log_at_idx ON public.treasury_sync_access_log (at);
REVOKE ALL ON public.treasury_sync_requests, public.treasury_sync_access_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.treasury_sync_requests, public.treasury_sync_access_log TO service_role;
ALTER TABLE public.treasury_sync_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_sync_access_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (bypasses RLS) can read or write them.

-- 4) Service-only functions ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.treasury_sync_pending(_statuses text[] DEFAULT ARRAY['submitted'], _limit integer DEFAULT 50,
  _after_submitted timestamptz DEFAULT NULL, _after_id uuid DEFAULT NULL)
RETURNS TABLE(application_id uuid, user_id uuid, status text, full_name text, email text, requested_category text,
  submitted_at timestamptz, updated_at timestamptz, file_path text, filename text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.user_id, a.status, a.full_name, a.email, a.requested_category, a.submitted_at, a.updated_at, a.file_path, a.filename
  FROM public.membership_applications a
  WHERE a.status = ANY (_statuses) AND a.status IN ('submitted','review')
    AND (_after_submitted IS NULL OR (a.submitted_at, a.id) > (_after_submitted, _after_id))
  ORDER BY a.submitted_at, a.id
  LIMIT LEAST(GREATEST(coalesce(_limit, 50), 1), 100)
$$;

CREATE OR REPLACE FUNCTION public.member_public_role_sync(_user uuid, _category text, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role text := CASE _category WHEN 'Fondatore' THEN 'founder' WHEN 'Ordinario' THEN 'ordinary' WHEN 'Sostenitore' THEN 'supporter' END;
BEGIN
  DELETE FROM public.user_roles WHERE user_id = _user AND role::text IN ('founder','ordinary','supporter')
    AND (NOT _active OR role::text IS DISTINCT FROM _role);
  IF _active AND _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user, _role::public.app_role) ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- Writes/updates the projection; ignores updates older than the stored one (late or re-ordered syncs).
CREATE OR REPLACE FUNCTION public.member_public_upsert(_tm uuid, _user uuid, _app uuid, _m jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur public.member_public_status; _ts timestamptz := coalesce((_m->>'updated_at')::timestamptz, now());
  _status text := coalesce(_m->>'membership_status', 'active'); _cat text := _m->>'category';
BEGIN
  SELECT * INTO _cur FROM public.member_public_status WHERE treasury_member_id = _tm FOR UPDATE;
  IF FOUND AND _cur.treasury_updated_at > _ts THEN RETURN 'stale'; END IF;
  IF EXISTS (SELECT 1 FROM public.member_public_status WHERE user_id = _user AND treasury_member_id <> _tm) THEN
    RAISE EXCEPTION 'conflict: account already linked to another treasury member' USING ERRCODE = 'P0409';
  END IF;
  IF _cat IS NULL THEN _cat := _cur.category; END IF;
  IF _cat IS NULL THEN RAISE EXCEPTION 'invalid: member.category is required' USING ERRCODE = 'P0422'; END IF;
  INSERT INTO public.member_public_status AS p (treasury_member_id, user_id, application_id, membership_status, category,
    card_number, admission_date, membership_year, fee_status, treasury_updated_at, updated_at)
  VALUES (_tm, _user, _app, _status, _cat, (_m->>'card_number')::integer, (_m->>'admission_date')::date,
    (_m->>'membership_year')::integer, _m->>'fee_status', _ts, now())
  ON CONFLICT (treasury_member_id) DO UPDATE SET
    membership_status = EXCLUDED.membership_status, category = EXCLUDED.category,
    card_number = CASE WHEN _m ? 'card_number' THEN EXCLUDED.card_number ELSE p.card_number END,
    admission_date = CASE WHEN _m ? 'admission_date' THEN EXCLUDED.admission_date ELSE p.admission_date END,
    membership_year = CASE WHEN _m ? 'membership_year' THEN EXCLUDED.membership_year ELSE p.membership_year END,
    fee_status = CASE WHEN _m ? 'fee_status' THEN EXCLUDED.fee_status ELSE p.fee_status END,
    application_id = coalesce(p.application_id, EXCLUDED.application_id),
    treasury_updated_at = EXCLUDED.treasury_updated_at, updated_at = now();
  SELECT * INTO _cur FROM public.member_public_status WHERE treasury_member_id = _tm;
  -- Site role only for active members with a card actually assigned by the Treasury (v5 rule).
  PERFORM public.member_public_role_sync(_user, _cur.category, _cur.membership_status = 'active' AND _cur.card_number IS NOT NULL);
  RETURN 'applied';
END $$;

-- Single entry point for every Treasury decision. Atomic, row-locked and idempotent.
CREATE OR REPLACE FUNCTION public.treasury_sync_apply(_action text, _idempotency_key text, _request_id text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hash text := md5(_action || ':' || coalesce(_payload::text, ''));
  _prev public.treasury_sync_requests;
  _app public.membership_applications;
  _app_id uuid := nullif(_payload->>'application_id','')::uuid;
  _tm uuid := nullif(_payload->>'treasury_member_id','')::uuid;
  _msg text := _payload->>'public_status_message';
  _result text := 'applied';
  _res jsonb;
  _mp text;
BEGIN
  SELECT * INTO _prev FROM public.treasury_sync_requests WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _prev.payload_hash <> _hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0409'; END IF;
    RETURN _prev.response || jsonb_build_object('replayed', true);
  END IF;
  IF _msg IS NOT NULL AND char_length(_msg) > 500 THEN RAISE EXCEPTION 'invalid: public_status_message too long' USING ERRCODE = 'P0422'; END IF;

  IF _action = 'member_update' THEN
    IF _tm IS NULL THEN RAISE EXCEPTION 'invalid: treasury_member_id is required' USING ERRCODE = 'P0422'; END IF;
    SELECT * INTO _app FROM public.membership_applications WHERE treasury_member_id = _tm FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found: no approved application for this treasury member' USING ERRCODE = 'P0404'; END IF;
    _result := public.member_public_upsert(_tm, _app.user_id, _app.id, coalesce(_payload->'member','{}'::jsonb));
  ELSE
    IF _app_id IS NULL THEN RAISE EXCEPTION 'invalid: application_id is required' USING ERRCODE = 'P0422'; END IF;
    SELECT * INTO _app FROM public.membership_applications WHERE id = _app_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found: application' USING ERRCODE = 'P0404'; END IF;

    IF _action = 'review' THEN
      IF _app.status = 'submitted' THEN
        UPDATE public.membership_applications SET status='review', reviewed_at=now() WHERE id=_app.id;
        INSERT INTO public.association_member_events (application_id, event_type, notes) VALUES (_app.id, 'application_review', 'treasury-sync');
      ELSIF _app.status IN ('review','approved','rejected','cancelled') THEN _result := 'noop';
      ELSE RAISE EXCEPTION 'invalid_state: application is %', _app.status USING ERRCODE = 'P0409'; END IF;

    ELSIF _action = 'approve' THEN
      IF _tm IS NULL THEN RAISE EXCEPTION 'invalid: treasury_member_id is required' USING ERRCODE = 'P0422'; END IF;
      IF _app.status = 'approved' THEN
        IF _app.treasury_member_id IS DISTINCT FROM _tm THEN RAISE EXCEPTION 'conflict: application already approved with another treasury_member_id' USING ERRCODE = 'P0409'; END IF;
        _result := 'noop';
      ELSIF _app.status IN ('submitted','review') THEN
        IF EXISTS (SELECT 1 FROM public.membership_applications WHERE treasury_member_id = _tm AND id <> _app.id) THEN
          RAISE EXCEPTION 'conflict: treasury_member_id already used by another application' USING ERRCODE = 'P0409';
        END IF;
        UPDATE public.membership_applications SET status='approved', treasury_member_id=_tm,
          approved_at = coalesce((_payload->>'approved_at')::timestamptz, now()), decided_at = coalesce(decided_at, now()),
          reviewed_at = coalesce(reviewed_at, now()), public_status_message = _msg
        WHERE id=_app.id;
        INSERT INTO public.association_member_events (application_id, event_type, category, notes)
        VALUES (_app.id, 'approved', _payload->'member'->>'category', 'treasury-sync');
      ELSE RAISE EXCEPTION 'invalid_state: application is %', _app.status USING ERRCODE = 'P0409'; END IF;
      _mp := public.member_public_upsert(_tm, _app.user_id, _app.id, coalesce(_payload->'member','{}'::jsonb));

    ELSIF _action = 'reject' THEN
      IF _app.status = 'rejected' THEN _result := 'noop';
      ELSIF _app.status IN ('submitted','review') THEN
        UPDATE public.membership_applications SET status='rejected', rejected_at = coalesce((_payload->>'rejected_at')::timestamptz, now()),
          decided_at = coalesce(decided_at, now()), reviewed_at = coalesce(reviewed_at, now()), public_status_message = _msg
        WHERE id=_app.id;
        INSERT INTO public.association_member_events (application_id, event_type, notes) VALUES (_app.id, 'rejected', 'treasury-sync');
      ELSE RAISE EXCEPTION 'invalid_state: application is %', _app.status USING ERRCODE = 'P0409'; END IF;

    ELSIF _action = 'cancel' THEN
      IF _app.status = 'cancelled' THEN _result := 'noop';
      ELSIF _app.status IN ('draft','submitted','review') THEN
        UPDATE public.membership_applications SET status='cancelled', cancelled_at=now(), public_status_message=_msg WHERE id=_app.id;
      ELSE RAISE EXCEPTION 'invalid_state: application is %', _app.status USING ERRCODE = 'P0409'; END IF;
    ELSE
      RAISE EXCEPTION 'invalid: unknown action %', _action USING ERRCODE = 'P0422';
    END IF;
    SELECT * INTO _app FROM public.membership_applications WHERE id = _app.id;
  END IF;

  _res := jsonb_build_object('ok', true, 'result', _result, 'application_id', _app.id, 'status', _app.status,
    'treasury_member_id', _app.treasury_member_id, 'updated_at', _app.updated_at, 'replayed', false);
  IF _mp IS NOT NULL THEN _res := _res || jsonb_build_object('member_projection', _mp); END IF;
  INSERT INTO public.treasury_sync_requests (idempotency_key, action, application_id, treasury_member_id, payload_hash, response, request_id)
  VALUES (_idempotency_key, _action, _app.id, coalesce(_tm, _app.treasury_member_id), _hash, _res, _request_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN _res;
END $$;

REVOKE EXECUTE ON FUNCTION public.treasury_sync_pending(text[], integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.treasury_sync_apply(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_public_upsert(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_public_role_sync(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_sync_pending(text[], integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.treasury_sync_apply(text, text, text, jsonb) TO service_role;

COMMIT;

-- RLS self-check (run as an ordinary signed-in user; every statement must fail or return 0 rows):
--   UPDATE membership_applications SET status='approved' WHERE user_id = auth.uid();             -> error / 0 rows
--   UPDATE membership_applications SET treasury_member_id = gen_random_uuid() WHERE user_id = auth.uid(); -> permission denied
--   SELECT * FROM membership_applications WHERE user_id <> auth.uid();                            -> 0 rows
--   SELECT * FROM member_public_status WHERE user_id <> auth.uid();                               -> 0 rows
--   SELECT public.treasury_sync_apply('approve','x','x','{}');                                    -> permission denied
--   SELECT public.membership_decide(gen_random_uuid(),'approved');                                -> permission denied
