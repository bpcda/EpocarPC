-- Epocar v14 — member_update v2: revisioned Treasury events for the Area Socio projection.
-- Execute AFTER membership-sync-v6.sql, treasury-bootstrap-v11.sql and treasury-bootstrap-v13.sql.
-- Safe to re-run. Never deletes applications, history, members, fees or events.
--
-- v2 envelope (action=member_update): event_id (stable across retries), revision (monotonic per member),
-- updated_at (UTC), and at least one of external_member_id / application_id. Partial updates only:
-- omitted field = unchanged; explicit JSON null is rejected (use clear_fields); clear_fields removes
-- previous values only at the documented paths. Amounts are decimal strings with 2 digits (EUR),
-- stored as numeric — never floating point. Each membership_year is stored separately.
-- Legacy v1 payloads (member{...} without event_id) keep working unchanged.
BEGIN;

-- 1) Projection extensions (Area Socio) ------------------------------------------------------------------
ALTER TABLE public.member_public_status
  ADD COLUMN IF NOT EXISTS application_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS membership_year integer,
  ADD COLUMN IF NOT EXISTS fee_status text,
  ADD COLUMN IF NOT EXISTS treasury_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS admission_status text CHECK (admission_status IN ('confirmed','unverified','not_admitted')),
  ADD COLUMN IF NOT EXISTS admission_source text CHECK (admission_source IN ('board_resolution','historical_register')),
  ADD COLUMN IF NOT EXISTS admission_reference text,
  ADD COLUMN IF NOT EXISTS admission_decision_date date,
  ADD COLUMN IF NOT EXISTS payment_iban text,
  ADD COLUMN IF NOT EXISTS payment_account_holder text,
  ADD COLUMN IF NOT EXISTS cessation_date date,
  ADD COLUMN IF NOT EXISTS cessation_reason text CHECK (cessation_reason IN ('resignation','expulsion','death','other')),
  ADD COLUMN IF NOT EXISTS public_message text CHECK (char_length(public_message) <= 500),
  ADD COLUMN IF NOT EXISTS last_revision integer NOT NULL DEFAULT 0;

-- 2) Annual fees: one row per member per year (2027 never overwrites 2026) --------------------------------
CREATE TABLE IF NOT EXISTS public.member_annual_fees (
  treasury_member_id uuid NOT NULL,
  membership_year integer NOT NULL CHECK (membership_year BETWEEN 2000 AND 2100),
  fee_status text CHECK (fee_status IN ('paid','partial','due','exempt')),
  fee_amount numeric(12,2) CHECK (fee_amount >= 0),
  fee_paid_amount numeric(12,2) CHECK (fee_paid_amount >= 0),
  fee_balance numeric(12,2),
  last_payment_date date,
  last_payment_amount numeric(12,2) CHECK (last_payment_amount >= 0),
  last_payment_receipt_number text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (treasury_member_id, membership_year)
);
GRANT SELECT ON public.member_annual_fees TO authenticated;
GRANT ALL ON public.member_annual_fees TO service_role;
ALTER TABLE public.member_annual_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maf_read_own ON public.member_annual_fees;
CREATE POLICY maf_read_own ON public.member_annual_fees FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.member_public_status s
    WHERE s.treasury_member_id = member_annual_fees.treasury_member_id AND s.user_id = auth.uid()));

-- 3) Applied Treasury events: idempotency + monotonic revision + conflict detection ----------------------
CREATE TABLE IF NOT EXISTS public.treasury_member_events (
  event_id text PRIMARY KEY CHECK (char_length(event_id) BETWEEN 8 AND 100),
  treasury_member_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  payload_hash text NOT NULL,
  result text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treasury_member_events_member_idx ON public.treasury_member_events (treasury_member_id, revision);
REVOKE ALL ON public.treasury_member_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.treasury_member_events TO service_role;
ALTER TABLE public.treasury_member_events ENABLE ROW LEVEL SECURITY; -- no policies: service_role only

-- 4) Helpers ---------------------------------------------------------------------------------------------
-- Decimal string with exactly 2 digits (canonical EUR amounts from the Treasury).
CREATE OR REPLACE FUNCTION public.is_money2(_v text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT _v ~ '^\d{1,10}\.\d{2}$' $$;

-- Same definition as v6: site category role only for active members with a card assigned by the Treasury.
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

-- 5) member_update v2 core --------------------------------------------------------------------------------
-- _tm/_user/_app are resolved by the caller from treasury_member_id / external_member_id / application_id.
-- Returns jsonb: { member_projection: 'applied'|'stale'|'duplicate', revision, event_id }.
CREATE OR REPLACE FUNCTION public.member_update_v2(_tm uuid, _user uuid, _app uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event text := _payload->>'event_id';
  _rev integer;
  _ts timestamptz;
  _hash text := md5('member_update_v2:' || coalesce(_payload::text, ''));
  _ev public.treasury_member_events;
  _cur public.member_public_status;
  _fee jsonb := _payload->'annual_fee';
  _adm jsonb := _payload->'admission';
  _pay jsonb := _payload->'payment_coordinates';
  _ces jsonb := _payload->'cessation';
  _lp jsonb;
  _clear text[] := coalesce(ARRAY(SELECT jsonb_array_elements_text(_payload->'clear_fields')), ARRAY[]::text[]);
  _allowed_clear constant text[] := ARRAY['card_number','admission_date','admission','payment_coordinates','cessation','public_message','annual_fee.last_payment'];
  _c text;
  _year integer;
  _status text;
  _cat text;
BEGIN
  -- Envelope validation.
  IF _event IS NULL OR char_length(_event) < 8 OR char_length(_event) > 100 THEN
    RAISE EXCEPTION 'invalid: event_id (8-100 chars) is required' USING ERRCODE = 'P0422'; END IF;
  IF _payload->>'revision' IS NULL OR _payload->>'revision' !~ '^\d+$' THEN
    RAISE EXCEPTION 'invalid: revision must be a positive integer' USING ERRCODE = 'P0422'; END IF;
  _rev := (_payload->>'revision')::integer;
  IF _rev < 1 THEN RAISE EXCEPTION 'invalid: revision must be a positive integer' USING ERRCODE = 'P0422'; END IF;
  IF _payload->>'updated_at' IS NULL OR _payload->>'updated_at' !~ '^\d{4}-\d{2}-\d{2}[T ]' THEN
    RAISE EXCEPTION 'invalid: updated_at (ISO 8601 UTC) is required' USING ERRCODE = 'P0422'; END IF;
  _ts := (_payload->>'updated_at')::timestamptz;
  IF _tm IS NULL THEN RAISE EXCEPTION 'invalid: member not resolvable' USING ERRCODE = 'P0422'; END IF;

  -- Coherence: when both identifiers are present they must point to the same member.
  IF _app IS NOT NULL AND _user IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.membership_applications a
      WHERE a.id = _app AND a.user_id = _user AND a.treasury_member_id = _tm) THEN
      RAISE EXCEPTION 'conflict: incoherent external_member_id/application_id' USING ERRCODE = 'P0409';
    END IF;
  END IF;

  -- Explicit JSON null is never "unknown": use clear_fields. Reject present-but-null known fields.
  FOREACH _c IN ARRAY ARRAY['category','membership_status','card_number','admission_date','admission',
      'annual_fee','payment_coordinates','cessation','public_message'] LOOP
    IF _payload ? _c AND jsonb_typeof(_payload->_c) = 'null' THEN
      RAISE EXCEPTION 'invalid: null is not allowed for %, use clear_fields', _c USING ERRCODE = 'P0422';
    END IF;
  END LOOP;

  -- clear_fields: documented paths only, never combined with an update of the same field.
  FOREACH _c IN ARRAY _clear LOOP
    IF NOT (_c = ANY(_allowed_clear)) THEN
      RAISE EXCEPTION 'invalid: clear_fields path % is not allowed', _c USING ERRCODE = 'P0422'; END IF;
    IF (_c <> 'annual_fee.last_payment' AND _payload ? _c)
       OR (_c = 'annual_fee.last_payment' AND (_fee IS NULL OR _fee ? 'last_payment' OR _fee->>'membership_year' IS NULL)) THEN
      RAISE EXCEPTION 'invalid: ambiguous update and clear of %', _c USING ERRCODE = 'P0422';
    END IF;
  END LOOP;

  -- Lock the projection row (created on first update for bootstrapped members).
  SELECT * INTO _cur FROM public.member_public_status WHERE treasury_member_id = _tm FOR UPDATE;
  IF NOT FOUND AND _user IS NULL THEN
    RAISE EXCEPTION 'not_found: member' USING ERRCODE = 'P0404'; END IF;

  -- Event idempotency and monotonic revision.
  SELECT * INTO _ev FROM public.treasury_member_events WHERE event_id = _event;
  IF FOUND THEN
    IF _ev.payload_hash <> _hash OR _ev.treasury_member_id <> _tm THEN
      RAISE EXCEPTION 'conflict: event_id already applied with different content' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('member_projection', 'duplicate', 'revision', _ev.revision, 'event_id', _event);
  END IF;
  IF _cur.last_revision IS NOT NULL AND _rev < _cur.last_revision THEN
    RETURN jsonb_build_object('member_projection', 'stale', 'revision', _cur.last_revision, 'event_id', _event);
  END IF;
  IF _cur.last_revision IS NOT NULL AND _rev = _cur.last_revision THEN
    RAISE EXCEPTION 'conflict: revision % already applied with different content', _rev USING ERRCODE = 'P0409'; END IF;

  -- Scalar associative data (omitted = unchanged).
  _status := CASE WHEN _payload ? 'membership_status' THEN _payload->>'membership_status' ELSE coalesce(_cur.membership_status, 'active') END;
  IF _status NOT IN ('active','suspended','ceased') THEN
    RAISE EXCEPTION 'invalid: membership_status' USING ERRCODE = 'P0422'; END IF;
  _cat := CASE WHEN _payload ? 'category' THEN _payload->>'category' ELSE _cur.category END;
  IF _cat IS NULL THEN RAISE EXCEPTION 'invalid: category is required' USING ERRCODE = 'P0422'; END IF;
  IF _cat NOT IN ('Fondatore','Ordinario','Sostenitore','Onorario') THEN
    RAISE EXCEPTION 'invalid: category' USING ERRCODE = 'P0422'; END IF;
  IF _payload ? 'card_number' AND (_payload->>'card_number' !~ '^\d+$' OR (_payload->>'card_number')::integer < 1) THEN
    RAISE EXCEPTION 'invalid: card_number' USING ERRCODE = 'P0422'; END IF;

  INSERT INTO public.member_public_status AS p (treasury_member_id, user_id, application_id, membership_status, category,
    card_number, admission_date, treasury_updated_at, updated_at, last_revision)
  VALUES (_tm, _user, _app, _status, _cat,
    CASE WHEN _payload ? 'card_number' THEN (_payload->>'card_number')::integer END,
    CASE WHEN _payload ? 'admission_date' THEN nullif(_payload->>'admission_date','')::date END,
    _ts, now(), _rev)
  ON CONFLICT (treasury_member_id) DO UPDATE SET
    membership_status = EXCLUDED.membership_status, category = EXCLUDED.category,
    card_number = CASE WHEN _payload ? 'card_number' THEN EXCLUDED.card_number ELSE p.card_number END,
    admission_date = CASE WHEN _payload ? 'admission_date' THEN EXCLUDED.admission_date ELSE p.admission_date END,
    application_id = coalesce(p.application_id, EXCLUDED.application_id),
    treasury_updated_at = EXCLUDED.treasury_updated_at, updated_at = now(), last_revision = EXCLUDED.last_revision;

  -- Admission evidence: 'confirmed' requires an explicit Treasury source. Roles/cards/links never prove it.
  IF _adm IS NOT NULL THEN
    IF _adm->>'status' NOT IN ('confirmed','unverified','not_admitted') THEN
      RAISE EXCEPTION 'invalid: admission.status' USING ERRCODE = 'P0422'; END IF;
    IF _adm->>'status' = 'confirmed' AND coalesce(_adm->>'source','') NOT IN ('board_resolution','historical_register') THEN
      RAISE EXCEPTION 'invalid: admission confirmed requires source board_resolution|historical_register' USING ERRCODE = 'P0422'; END IF;
    UPDATE public.member_public_status SET
      admission_status = _adm->>'status',
      admission_source = nullif(_adm->>'source',''),
      admission_reference = nullif(_adm->>'reference',''),
      admission_decision_date = nullif(_adm->>'decision_date','')::date
    WHERE treasury_member_id = _tm;
  END IF;

  -- Annual fee: one row per year; amounts are canonical 2-digit decimal strings, stored as numeric.
  -- fee_status is never deduced from last_payment.
  IF _fee IS NOT NULL THEN
    IF _fee->>'membership_year' IS NULL OR _fee->>'membership_year' !~ '^\d{4}$' THEN
      RAISE EXCEPTION 'invalid: annual_fee.membership_year' USING ERRCODE = 'P0422'; END IF;
    _year := (_fee->>'membership_year')::integer;
    IF _fee ? 'fee_status' AND _fee->>'fee_status' NOT IN ('paid','partial','due','exempt') THEN
      RAISE EXCEPTION 'invalid: annual_fee.fee_status' USING ERRCODE = 'P0422'; END IF;
    FOREACH _c IN ARRAY ARRAY['fee_amount','fee_paid_amount','fee_balance'] LOOP
      IF _fee ? _c AND NOT public.is_money2(_fee->>_c) THEN
        RAISE EXCEPTION 'invalid: annual_fee.% must be a decimal string with 2 digits', _c USING ERRCODE = 'P0422'; END IF;
    END LOOP;
    _lp := _fee->'last_payment';
    IF _lp IS NOT NULL THEN
      IF _lp ? 'amount' AND NOT public.is_money2(_lp->>'amount') THEN
        RAISE EXCEPTION 'invalid: annual_fee.last_payment.amount must be a decimal string with 2 digits' USING ERRCODE = 'P0422'; END IF;
      IF _lp ? 'date' AND coalesce(_lp->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'invalid: annual_fee.last_payment.date' USING ERRCODE = 'P0422'; END IF;
    END IF;
    INSERT INTO public.member_annual_fees AS f (treasury_member_id, membership_year, fee_status,
      fee_amount, fee_paid_amount, fee_balance, last_payment_date, last_payment_amount, last_payment_receipt_number, updated_at)
    VALUES (_tm, _year,
      CASE WHEN _fee ? 'fee_status' THEN _fee->>'fee_status' END,
      CASE WHEN _fee ? 'fee_amount' THEN (_fee->>'fee_amount')::numeric END,
      CASE WHEN _fee ? 'fee_paid_amount' THEN (_fee->>'fee_paid_amount')::numeric END,
      CASE WHEN _fee ? 'fee_balance' THEN (_fee->>'fee_balance')::numeric END,
      CASE WHEN _lp ? 'date' THEN (_lp->>'date')::date END,
      CASE WHEN _lp ? 'amount' THEN (_lp->>'amount')::numeric END,
      CASE WHEN _lp ? 'receipt_number' THEN _lp->>'receipt_number' END,
      now())
    ON CONFLICT (treasury_member_id, membership_year) DO UPDATE SET
      fee_status = CASE WHEN _fee ? 'fee_status' THEN EXCLUDED.fee_status ELSE f.fee_status END,
      fee_amount = CASE WHEN _fee ? 'fee_amount' THEN EXCLUDED.fee_amount ELSE f.fee_amount END,
      fee_paid_amount = CASE WHEN _fee ? 'fee_paid_amount' THEN EXCLUDED.fee_paid_amount ELSE f.fee_paid_amount END,
      fee_balance = CASE WHEN _fee ? 'fee_balance' THEN EXCLUDED.fee_balance ELSE f.fee_balance END,
      last_payment_date = CASE WHEN _lp IS NOT NULL AND _lp ? 'date' THEN EXCLUDED.last_payment_date ELSE f.last_payment_date END,
      last_payment_amount = CASE WHEN _lp IS NOT NULL AND _lp ? 'amount' THEN EXCLUDED.last_payment_amount ELSE f.last_payment_amount END,
      last_payment_receipt_number = CASE WHEN _lp IS NOT NULL AND _lp ? 'receipt_number' THEN EXCLUDED.last_payment_receipt_number ELSE f.last_payment_receipt_number END,
      updated_at = now();
    -- Keep the flat projection columns aligned with the most recent year sent (display convenience only).
    UPDATE public.member_public_status SET membership_year = _year, fee_status = coalesce(_fee->>'fee_status', fee_status)
    WHERE treasury_member_id = _tm AND _fee ? 'fee_status';
  END IF;

  -- Payment coordinates (optional).
  IF _pay IS NOT NULL THEN
    IF _pay ? 'iban' AND replace(upper(_pay->>'iban'), ' ', '') !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$' THEN
      RAISE EXCEPTION 'invalid: payment_coordinates.iban' USING ERRCODE = 'P0422'; END IF;
    UPDATE public.member_public_status SET
      payment_iban = CASE WHEN _pay ? 'iban' THEN replace(upper(_pay->>'iban'), ' ', '') ELSE payment_iban END,
      payment_account_holder = CASE WHEN _pay ? 'account_holder' THEN _pay->>'account_holder' ELSE payment_account_holder END
    WHERE treasury_member_id = _tm;
  END IF;

  -- Cessation (optional).
  IF _ces IS NOT NULL THEN
    IF _ces ? 'reason' AND _ces->>'reason' NOT IN ('resignation','expulsion','death','other') THEN
      RAISE EXCEPTION 'invalid: cessation.reason' USING ERRCODE = 'P0422'; END IF;
    UPDATE public.member_public_status SET
      cessation_date = CASE WHEN _ces ? 'date' THEN nullif(_ces->>'date','')::date ELSE cessation_date END,
      cessation_reason = CASE WHEN _ces ? 'reason' THEN _ces->>'reason' ELSE cessation_reason END
    WHERE treasury_member_id = _tm;
  END IF;

  -- Public message (expressly intended for the member, never internal notes).
  IF _payload ? 'public_message' THEN
    IF char_length(_payload->>'public_message') > 500 THEN
      RAISE EXCEPTION 'invalid: public_message too long' USING ERRCODE = 'P0422'; END IF;
    UPDATE public.member_public_status SET public_message = _payload->>'public_message' WHERE treasury_member_id = _tm;
  END IF;

  -- Explicit clears (documented paths only).
  FOREACH _c IN ARRAY _clear LOOP
    CASE _c
      WHEN 'card_number' THEN UPDATE public.member_public_status SET card_number = NULL WHERE treasury_member_id = _tm;
      WHEN 'admission_date' THEN UPDATE public.member_public_status SET admission_date = NULL WHERE treasury_member_id = _tm;
      WHEN 'admission' THEN UPDATE public.member_public_status SET admission_status = NULL, admission_source = NULL,
        admission_reference = NULL, admission_decision_date = NULL WHERE treasury_member_id = _tm;
      WHEN 'payment_coordinates' THEN UPDATE public.member_public_status SET payment_iban = NULL, payment_account_holder = NULL WHERE treasury_member_id = _tm;
      WHEN 'cessation' THEN UPDATE public.member_public_status SET cessation_date = NULL, cessation_reason = NULL WHERE treasury_member_id = _tm;
      WHEN 'public_message' THEN UPDATE public.member_public_status SET public_message = NULL WHERE treasury_member_id = _tm;
      WHEN 'annual_fee.last_payment' THEN UPDATE public.member_annual_fees SET last_payment_date = NULL,
        last_payment_amount = NULL, last_payment_receipt_number = NULL, updated_at = now()
        WHERE treasury_member_id = _tm AND membership_year = (_fee->>'membership_year')::integer;
    END CASE;
  END LOOP;

  -- Record the event and sync the site category role (active + card assigned, v5/v6 rule).
  INSERT INTO public.treasury_member_events (event_id, treasury_member_id, revision, payload_hash, result)
  VALUES (_event, _tm, _rev, _hash, 'applied');
  SELECT * INTO _cur FROM public.member_public_status WHERE treasury_member_id = _tm;
  IF _cur.user_id IS NOT NULL THEN
    PERFORM public.member_public_role_sync(_cur.user_id, _cur.category, _cur.membership_status = 'active' AND _cur.card_number IS NOT NULL);
  END IF;
  RETURN jsonb_build_object('member_projection', 'applied', 'revision', _rev, 'event_id', _event);
END $$;

-- 6) treasury_sync_apply: route member_update with event_id to v2 ------------------------------------------
CREATE OR REPLACE FUNCTION public.treasury_sync_apply(_action text, _idempotency_key text, _request_id text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hash text := md5(_action || ':' || coalesce(_payload::text, ''));
  _prev public.treasury_sync_requests;
  _app public.membership_applications;
  _app_id uuid := nullif(_payload->>'application_id','')::uuid;
  _tm uuid := nullif(_payload->>'treasury_member_id','')::uuid;
  _ext uuid := nullif(_payload->>'external_member_id','')::uuid;
  _user uuid;
  _msg text := _payload->>'public_status_message';
  _result text := 'applied';
  _res jsonb;
  _mp text;
  _v2 jsonb;
BEGIN
  SELECT * INTO _prev FROM public.treasury_sync_requests WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _prev.payload_hash <> _hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0409'; END IF;
    RETURN _prev.response || jsonb_build_object('replayed', true);
  END IF;
  IF _msg IS NOT NULL AND char_length(_msg) > 500 THEN RAISE EXCEPTION 'invalid: public_status_message too long' USING ERRCODE = 'P0422'; END IF;

  IF _action = 'member_update' THEN
    IF _payload ? 'event_id' THEN
      -- v2: resolve the member from treasury_member_id, application_id or external_member_id.
      IF _tm IS NULL AND _app_id IS NOT NULL THEN
        SELECT a.treasury_member_id INTO _tm FROM public.membership_applications a WHERE a.id = _app_id; END IF;
      IF _tm IS NULL AND _ext IS NOT NULL THEN
        SELECT l.treasury_member_id INTO _tm FROM public.treasury_bootstrap_links l WHERE l.external_member_id = _ext; END IF;
      IF _tm IS NULL AND _ext IS NOT NULL THEN
        SELECT s.treasury_member_id INTO _tm FROM public.member_public_status s WHERE s.user_id = _ext; END IF;
      IF _tm IS NULL THEN RAISE EXCEPTION 'not_found: member' USING ERRCODE = 'P0404'; END IF;
      SELECT s.user_id, s.application_id INTO _user, _app_id FROM public.member_public_status s WHERE s.treasury_member_id = _tm;
      _user := coalesce(_user, _ext);
      _app_id := coalesce(_app_id, nullif(_payload->>'application_id','')::uuid);
      _v2 := public.member_update_v2(_tm, _user, _app_id, _payload);
      _result := coalesce(_v2->>'member_projection', 'applied');
      _res := jsonb_build_object('ok', true, 'result', _result, 'application_id', _app_id,
        'treasury_member_id', _tm, 'replayed', false) || _v2;
    ELSE
      -- Legacy v1 payload (member{...} without event_id): unchanged behaviour.
      IF _tm IS NULL THEN RAISE EXCEPTION 'invalid: treasury_member_id is required' USING ERRCODE = 'P0422'; END IF;
      SELECT * INTO _app FROM public.membership_applications WHERE treasury_member_id = _tm FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'not_found: no approved application for this treasury member' USING ERRCODE = 'P0404'; END IF;
      _result := public.member_public_upsert(_tm, _app.user_id, _app.id, coalesce(_payload->'member','{}'::jsonb));
      _res := jsonb_build_object('ok', true, 'result', _result, 'application_id', _app.id, 'status', _app.status,
        'treasury_member_id', _app.treasury_member_id, 'updated_at', _app.updated_at, 'replayed', false);
    END IF;
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
    _res := jsonb_build_object('ok', true, 'result', _result, 'application_id', _app.id, 'status', _app.status,
      'treasury_member_id', _app.treasury_member_id, 'updated_at', _app.updated_at, 'replayed', false);
    IF _mp IS NOT NULL THEN _res := _res || jsonb_build_object('member_projection', _mp); END IF;
  END IF;

  INSERT INTO public.treasury_sync_requests (idempotency_key, action, application_id, treasury_member_id, payload_hash, response, request_id)
  VALUES (_idempotency_key, _action, _app_id, _tm, _hash, _res, _request_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN _res;
END $$;

-- 7) bootstrap member_update: v2 envelope support (historic members without an online application) -------
CREATE OR REPLACE FUNCTION public.treasury_sync_bootstrap_member_update(_idempotency_key text, _request_id text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _hash text := md5('member_update:' || coalesce(_payload::text, ''));
  _prev public.treasury_sync_requests;
  _tm uuid := nullif(_payload->>'treasury_member_id','')::uuid;
  _ext uuid := nullif(_payload->>'external_member_id','')::uuid;
  _link public.treasury_bootstrap_links;
  _roles text[];
  _mp text;
  _v2 jsonb;
  _p public.member_public_status;
  _res jsonb;
BEGIN
  SELECT * INTO _prev FROM public.treasury_sync_requests WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _prev.payload_hash <> _hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0409'; END IF;
    RETURN _prev.response || jsonb_build_object('replayed', true);
  END IF;
  IF _tm IS NULL AND _ext IS NOT NULL THEN
    SELECT l.treasury_member_id INTO _tm FROM public.treasury_bootstrap_links l WHERE l.external_member_id = _ext; END IF;
  SELECT * INTO _link FROM public.treasury_bootstrap_links WHERE treasury_member_id = _tm FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: bootstrap member' USING ERRCODE = 'P0404'; END IF;
  IF _ext IS NOT NULL AND _ext <> _link.external_member_id THEN
    RAISE EXCEPTION 'conflict: external_member_id does not match the linked account' USING ERRCODE = 'P0409'; END IF;

  IF _payload ? 'event_id' THEN
    _v2 := public.member_update_v2(_tm, _link.external_member_id, NULL, _payload);
    _res := jsonb_build_object('ok', true, 'result', coalesce(_v2->>'member_projection','applied'),
      'external_member_id', _link.external_member_id, 'treasury_member_id', _tm, 'replayed', false) || _v2;
  ELSE
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
  END IF;
  INSERT INTO public.treasury_sync_requests (idempotency_key, action, treasury_member_id, payload_hash, response, request_id)
  VALUES (_idempotency_key, 'member_update', _tm, _hash, _res, _request_id) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN _res;
END $$;

REVOKE EXECUTE ON FUNCTION public.is_money2(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_update_v2(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_public_role_sync(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.treasury_sync_apply(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.treasury_sync_bootstrap_member_update(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_sync_apply(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.treasury_sync_bootstrap_member_update(text, text, jsonb) TO service_role;
COMMIT;

-- RLS self-check (as an ordinary signed-in user; every statement must fail or return 0 rows):
--   SELECT * FROM member_annual_fees WHERE treasury_member_id <> (own);   -> 0 rows
--   SELECT * FROM treasury_member_events;                                 -> 0 rows
--   SELECT public.member_update_v2(gen_random_uuid(), auth.uid(), NULL, '{}'); -> permission denied
