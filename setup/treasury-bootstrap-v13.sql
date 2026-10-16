-- Reapply acknowledgement only; requires membership-sync-v6 + treasury-bootstrap-v11.
BEGIN;
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

REVOKE ALL ON FUNCTION public.treasury_sync_bootstrap_ack(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_sync_bootstrap_ack(text,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
