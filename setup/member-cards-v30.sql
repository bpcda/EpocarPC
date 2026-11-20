-- External Epocar instance, after membership-sync-v14.sql. No membership decisions are changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.member_card_credentials (
  treasury_member_id uuid PRIMARY KEY,
  qr_token text NOT NULL CHECK (
    qr_token ~ '^v2\.[0-9a-f]{64}$' OR (
      qr_token ~ '^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{86}$'
      AND split_part(qr_token, '.', 2) = treasury_member_id::text
    )
  ),
  token_hash text GENERATED ALWAYS AS (encode(sha256(qr_token::bytea), 'hex')) STORED UNIQUE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
  card_number integer NOT NULL CHECK (card_number > 0),
  category text NOT NULL CHECK (category IN ('Fondatore','Ordinario','Sostenitore','Onorario')),
  issued_at timestamptz NOT NULL DEFAULT now()
);
-- No FK to a portal account or its projection: deleting an account never deletes an issued card.
ALTER TABLE public.member_card_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_card_credentials FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.member_card_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.issue_member_card(_member uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m public.member_public_status;
  _name text;
  _year integer := extract(year FROM timezone('Europe/Rome', now()));
BEGIN
  SELECT * INTO m FROM public.member_public_status WHERE treasury_member_id = _member FOR UPDATE;
  IF NOT FOUND OR m.card_number IS NULL OR m.card_number <= 0 THEN RETURN; END IF;
  SELECT nullif(btrim(a.full_name), '') INTO _name FROM public.membership_applications a
    WHERE a.user_id = m.user_id AND a.status = 'approved' AND a.approved_at IS NOT NULL
    ORDER BY a.approved_at DESC LIMIT 1;
  IF _name IS NULL THEN
    SELECT nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') INTO _name
      FROM public.profiles p WHERE p.user_id = m.user_id;
  END IF;
  _name := left(coalesce(_name, 'Tessera n. ' || m.card_number), 200);
  UPDATE public.member_card_credentials SET full_name = _name, card_number = m.card_number, category = m.category
    WHERE treasury_member_id = _member
      AND (full_name, card_number, category) IS DISTINCT FROM (_name, m.card_number, m.category);

  IF m.membership_status <> 'active' OR m.admission_status IS DISTINCT FROM 'confirmed'
    OR m.admission_source IS NULL OR m.admission_source NOT IN ('board_resolution','historical_register')
    OR m.last_revision <= 0 OR coalesce(m.admission_decision_date, m.admission_date) IS NULL
    OR coalesce(m.admission_decision_date, m.admission_date) > timezone('Europe/Rome', now())::date
    OR NOT EXISTS (SELECT 1 FROM public.member_annual_fees f WHERE f.treasury_member_id = _member
      AND f.membership_year = _year AND f.fee_status IN ('paid','exempt')) THEN RETURN; END IF;

  INSERT INTO public.member_card_credentials (treasury_member_id, qr_token, full_name, card_number, category)
    VALUES (_member, 'v2.' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      _name, m.card_number, m.category)
    ON CONFLICT (treasury_member_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.issue_member_card(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_member_card(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.member_card_sync_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.issue_member_card(NEW.treasury_member_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.member_card_sync_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_card_on_member_sync ON public.member_public_status;
CREATE TRIGGER member_card_on_member_sync AFTER INSERT OR UPDATE ON public.member_public_status
  FOR EACH ROW EXECUTE FUNCTION public.member_card_sync_trigger();
DROP TRIGGER IF EXISTS member_card_on_fee_sync ON public.member_annual_fees;
CREATE TRIGGER member_card_on_fee_sync AFTER INSERT OR UPDATE ON public.member_annual_fees
  FOR EACH ROW EXECUTE FUNCTION public.member_card_sync_trigger();

-- Import existing v1 cards privately before the initial backfill; never put real QR tokens in this script.
COMMIT;
