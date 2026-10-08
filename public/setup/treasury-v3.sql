-- Epocar Tesoreria v3 (numero tessera): execute once AFTER treasury.sql and treasury-v2.sql in your SQL editor.
-- * Every member gets a unique, progressive card number (1, 2, 3...) assigned by the server.
-- * The number is never reused and cannot be changed, so homonyms are always distinguishable.
-- * Two members may now share the same name (the card number tells them apart).

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.association_members_card_seq START 1;
ALTER TABLE public.association_members ADD COLUMN IF NOT EXISTS card_number integer;

-- Backfill existing members in order of admission / creation.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY admission_date NULLS LAST, created_at, id) AS n
  FROM public.association_members WHERE card_number IS NULL
)
UPDATE public.association_members m
SET card_number = o.n + COALESCE((SELECT max(card_number) FROM public.association_members), 0)
FROM ordered o WHERE m.id = o.id;

SELECT setval('public.association_members_card_seq', GREATEST(COALESCE((SELECT max(card_number) FROM public.association_members), 0), 1),
  (SELECT count(*) > 0 FROM public.association_members WHERE card_number IS NOT NULL));

ALTER TABLE public.association_members ALTER COLUMN card_number SET DEFAULT nextval('public.association_members_card_seq');
ALTER TABLE public.association_members ALTER COLUMN card_number SET NOT NULL;
ALTER TABLE public.association_members ADD CONSTRAINT association_members_card_number_key UNIQUE (card_number);
ALTER SEQUENCE public.association_members_card_seq OWNED BY public.association_members.card_number;
GRANT USAGE ON SEQUENCE public.association_members_card_seq TO authenticated;

-- Server always assigns the number; it can never be chosen or changed from the app.
CREATE OR REPLACE FUNCTION public.association_members_card_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.card_number := nextval('public.association_members_card_seq');
  ELSIF NEW.card_number IS DISTINCT FROM OLD.card_number THEN
    RAISE EXCEPTION 'Il numero tessera non può essere modificato';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS association_members_card_guard ON public.association_members;
CREATE TRIGGER association_members_card_guard BEFORE INSERT OR UPDATE ON public.association_members
  FOR EACH ROW EXECUTE FUNCTION public.association_members_card_guard();

-- Homonyms allowed: the card number is the unique identifier.
ALTER TABLE public.association_members DROP CONSTRAINT IF EXISTS association_members_full_name_key;

COMMENT ON COLUMN public.association_members.member_number IS 'DEPRECATED: replaced by card_number';

COMMIT;
