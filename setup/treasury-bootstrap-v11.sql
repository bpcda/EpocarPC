-- Epocar v11: bootstrap of pre-existing members (no membership_applications) towards the private Treasury.
-- Execute AFTER membership-sync-v6.sql. Safe to re-run. Does NOT modify user_roles, profiles or membership_applications.
-- Source of the existing members: public.user_roles (category roles founder/ordinary/supporter + board roles)
-- joined with public.profiles (name) and auth.users (email). Stable id = auth user id (never the email).
BEGIN;

-- Acknowledgement: Treasury member created for an existing site member. Original id (user_id) never changes.
CREATE TABLE IF NOT EXISTS public.treasury_bootstrap_links (
  external_member_id uuid PRIMARY KEY,               -- = auth user id of the pre-existing member
  treasury_member_id uuid NOT NULL UNIQUE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  request_id text
);
REVOKE ALL ON public.treasury_bootstrap_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.treasury_bootstrap_links TO service_role;
ALTER TABLE public.treasury_bootstrap_links ENABLE ROW LEVEL SECURITY; -- no policies: service_role only

-- Read-only list. Real values only: card/admission come from the Treasury projection if it already exists, else NULL.
CREATE OR REPLACE FUNCTION public.treasury_sync_bootstrap_members(_limit integer DEFAULT 50, _after uuid DEFAULT NULL)
RETURNS TABLE(external_member_id uuid, user_id uuid, first_name text, last_name text, full_name text, email text,
  category text, board_roles text[], admission_date date, card_number integer, treasury_member_id uuid,
  acknowledged_at timestamptz, account_created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT ur.user_id,
      min(CASE ur.role::text WHEN 'founder' THEN 'Fondatore' WHEN 'ordinary' THEN 'Ordinario' WHEN 'supporter' THEN 'Sostenitore' END) AS category,
      coalesce(array_agg(ur.role::text ORDER BY ur.role::text) FILTER (WHERE ur.role::text IN
        ('president','vice_president','secretary','treasurer','councillor')), ARRAY[]::text[]) AS board_roles
    FROM public.user_roles ur GROUP BY ur.user_id
  )
  SELECT r.user_id, r.user_id, p.first_name, p.last_name,
    nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), u.email::text,
    r.category, r.board_roles, s.admission_date, s.card_number,
    coalesce(l.treasury_member_id, s.treasury_member_id), l.acknowledged_at, u.created_at
  FROM r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  LEFT JOIN public.member_public_status s ON s.user_id = r.user_id
  LEFT JOIN public.treasury_bootstrap_links l ON l.external_member_id = r.user_id
  WHERE r.category IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.membership_applications a WHERE a.user_id = r.user_id AND a.status <> 'draft' AND a.status <> 'cancelled')
    AND (_after IS NULL OR r.user_id > _after)
  ORDER BY r.user_id
  LIMIT LEAST(GREATEST(coalesce(_limit, 50), 1), 100)
$$;

-- Acknowledge import (idempotent). Same pair = noop, different treasury_member_id = conflict.
CREATE OR REPLACE FUNCTION public.treasury_sync_bootstrap_ack(_idempotency_key text, _request_id text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hash text := md5('bootstrap_ack:' || coalesce(_payload::text, ''));
  _prev public.treasury_sync_requests;
  _ext uuid := nullif(_payload->>'external_member_id','')::uuid;
  _tm uuid := nullif(_payload->>'treasury_member_id','')::uuid;
  _cur public.treasury_bootstrap_links;
  _result text := 'applied';
  _res jsonb;
BEGIN
  SELECT * INTO _prev FROM public.treasury_sync_requests WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _prev.payload_hash <> _hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0409'; END IF;
    RETURN _prev.response || jsonb_build_object('replayed', true);
  END IF;
  IF _ext IS NULL OR _tm IS NULL THEN RAISE EXCEPTION 'invalid: external_member_id and treasury_member_id are required' USING ERRCODE = 'P0422'; END IF;
  -- Direct eligibility lookup: the public list is capped at 100 rows per page.
  -- A role is only a reconciliation candidate, never evidence of admission.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _ext
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text IN ('founder','ordinary','supporter'))
    AND NOT EXISTS (SELECT 1 FROM public.membership_applications a WHERE a.user_id = u.id AND a.status NOT IN ('draft','cancelled'))) THEN
    RAISE EXCEPTION 'not_found: existing member' USING ERRCODE = 'P0404';
  END IF;
  SELECT * INTO _cur FROM public.treasury_bootstrap_links WHERE external_member_id = _ext FOR UPDATE;
  IF FOUND THEN
    IF _cur.treasury_member_id <> _tm THEN RAISE EXCEPTION 'conflict: member already linked to another treasury_member_id' USING ERRCODE = 'P0409'; END IF;
    _result := 'noop';
  ELSE
    IF EXISTS (SELECT 1 FROM public.treasury_bootstrap_links WHERE treasury_member_id = _tm)
       OR EXISTS (SELECT 1 FROM public.membership_applications WHERE treasury_member_id = _tm)
       OR EXISTS (SELECT 1 FROM public.member_public_status WHERE treasury_member_id = _tm AND user_id <> _ext) THEN
      RAISE EXCEPTION 'conflict: treasury_member_id already used' USING ERRCODE = 'P0409';
    END IF;
    INSERT INTO public.treasury_bootstrap_links (external_member_id, treasury_member_id, request_id) VALUES (_ext, _tm, _request_id);
  END IF;
  _res := jsonb_build_object('ok', true, 'result', _result, 'external_member_id', _ext, 'treasury_member_id', _tm, 'replayed', false);
  INSERT INTO public.treasury_sync_requests (idempotency_key, action, treasury_member_id, payload_hash, response, request_id)
  VALUES (_idempotency_key, 'bootstrap_ack', _tm, _hash, _res, _request_id) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN _res;
END $$;

-- member_update for bootstrapped members: writes the projection; existing category roles are kept
-- while the Treasury has not assigned a card yet (they were set by the association before this workflow).
CREATE OR REPLACE FUNCTION public.treasury_sync_bootstrap_member_update(_idempotency_key text, _request_id text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hash text := md5('member_update:' || coalesce(_payload::text, ''));
  _prev public.treasury_sync_requests;
  _tm uuid := nullif(_payload->>'treasury_member_id','')::uuid;
  _link public.treasury_bootstrap_links;
  _roles text[];
  _mp text;
  _p public.member_public_status;
  _res jsonb;
BEGIN
  SELECT * INTO _prev FROM public.treasury_sync_requests WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _prev.payload_hash <> _hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0409'; END IF;
    RETURN _prev.response || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO _link FROM public.treasury_bootstrap_links WHERE treasury_member_id = _tm FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: bootstrap member' USING ERRCODE = 'P0404'; END IF;
  SELECT array_agg(role::text) INTO _roles FROM public.user_roles
    WHERE user_id = _link.external_member_id AND role::text IN ('founder','ordinary','supporter');
  _mp := public.member_public_upsert(_tm, _link.external_member_id, NULL, coalesce(_payload->'member','{}'::jsonb));
  SELECT * INTO _p FROM public.member_public_status WHERE treasury_member_id = _tm;
  IF _p.membership_status = 'active' AND _p.card_number IS NULL AND _roles IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) SELECT _link.external_member_id, x::public.app_role FROM unnest(_roles) x
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  _res := jsonb_build_object('ok', true, 'result', 'applied', 'external_member_id', _link.external_member_id,
    'treasury_member_id', _tm, 'member_projection', _mp, 'replayed', false);
  INSERT INTO public.treasury_sync_requests (idempotency_key, action, treasury_member_id, payload_hash, response, request_id)
  VALUES (_idempotency_key, 'member_update', _tm, _hash, _res, _request_id) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN _res;
END $$;

REVOKE EXECUTE ON FUNCTION public.treasury_sync_bootstrap_members(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.treasury_sync_bootstrap_ack(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.treasury_sync_bootstrap_member_update(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_sync_bootstrap_members(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.treasury_sync_bootstrap_ack(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.treasury_sync_bootstrap_member_update(text, text, jsonb) TO service_role;
COMMIT;

-- Check (read-only): SELECT full_name, category, board_roles, card_number FROM public.treasury_sync_bootstrap_members(100);
