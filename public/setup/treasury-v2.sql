-- Epocar Tesoreria v2: execute once AFTER treasury.sql in your external instance SQL editor.
-- * Treasurer is the only (and highest) accounting role. Admin, staff and president get NO treasury access.
-- * Membership fees per fiscal year, as resolved by the Board (Consiglio Direttivo), versioned and audited.

BEGIN;

-- 1) Accounting permissions are separate from technical ones: only 'treasurer'.
CREATE OR REPLACE FUNCTION public.is_treasury_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text = 'treasurer')
$$;

-- Close / reopen fiscal year: treasurer only (every change is written by treasury_years_audit).
DROP POLICY IF EXISTS tfy_admin_update ON public.treasury_fiscal_years;
DROP POLICY IF EXISTS tfy_treasurer_update ON public.treasury_fiscal_years;
CREATE POLICY tfy_treasurer_update ON public.treasury_fiscal_years FOR UPDATE TO authenticated
  USING (public.is_treasury_user(auth.uid())) WITH CHECK (public.is_treasury_user(auth.uid()));

-- Restoring a soft-deleted movement: treasurer (was admin).
CREATE OR REPLACE FUNCTION public.treasury_guard_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.treasury_fiscal_years WHERE year = NEW.fiscal_year AND status = 'closed')
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.treasury_fiscal_years WHERE year = OLD.fiscal_year AND status = 'closed')) THEN
    RAISE EXCEPTION 'Esercizio % chiuso: modifica non consentita', NEW.fiscal_year;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
    IF TG_TABLE_NAME = 'treasury_transactions' THEN
      NEW.created_by = OLD.created_by; NEW.created_at = OLD.created_at;
      IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN NEW.deleted_by = auth.uid(); END IF;
      IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND NOT public.is_treasury_user(auth.uid()) THEN
        RAISE EXCEPTION 'Solo il tesoriere può ripristinare un movimento eliminato';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2) Fees per fiscal year and category (never overwritten: a change supersedes the previous row).
CREATE TABLE IF NOT EXISTS public.treasury_fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL REFERENCES public.treasury_fiscal_years(year),
  category text NOT NULL CHECK (category IN ('Fondatore','Ordinario','Sostenitore','Onorario')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  exempt boolean NOT NULL DEFAULT false,
  resolution_number text CHECK (char_length(resolution_number) <= 50),
  resolution_date date,
  document_path text CHECK (document_path ~ '^delibere/[0-9]{4}/[0-9a-f-]+\.(pdf|jpg|jpeg|png)$'),
  document_name text CHECK (char_length(document_name) <= 255),
  notes text CHECK (char_length(notes) <= 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.treasury_fee_schedules(id),
  CHECK (NOT exempt OR amount = 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_fee_current_uq ON public.treasury_fee_schedules (fiscal_year, category) WHERE superseded_at IS NULL;
GRANT SELECT ON public.treasury_fee_schedules TO authenticated; -- writes only through treasury_set_fee()
GRANT ALL ON public.treasury_fee_schedules TO service_role;
ALTER TABLE public.treasury_fee_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tfs_read ON public.treasury_fee_schedules;
CREATE POLICY tfs_read ON public.treasury_fee_schedules FOR SELECT TO authenticated USING (public.is_treasury_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.treasury_fee_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Le quote deliberate non possono essere cancellate'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL
     OR (to_jsonb(NEW) - 'superseded_at' - 'superseded_by') <> (to_jsonb(OLD) - 'superseded_at' - 'superseded_by') THEN
    RAISE EXCEPTION 'Le quote deliberate non si modificano: registrare una nuova delibera';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS treasury_fee_immutable ON public.treasury_fee_schedules;
CREATE TRIGGER treasury_fee_immutable BEFORE UPDATE OR DELETE ON public.treasury_fee_schedules FOR EACH ROW EXECUTE FUNCTION public.treasury_fee_immutable();
DROP TRIGGER IF EXISTS treasury_fee_audit ON public.treasury_fee_schedules;
CREATE TRIGGER treasury_fee_audit AFTER INSERT OR UPDATE ON public.treasury_fee_schedules FOR EACH ROW EXECUTE FUNCTION public.treasury_audit();

-- Register a Board-resolved fee (atomic: supersede current + insert new, both audited).
CREATE OR REPLACE FUNCTION public.treasury_set_fee(
  _year integer, _category text, _amount numeric, _exempt boolean,
  _resolution_number text, _resolution_date date, _document_path text, _document_name text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old uuid; _new uuid;
BEGIN
  IF NOT public.is_treasury_user(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treasury_fiscal_years WHERE year = _year AND status = 'open') THEN
    RAISE EXCEPTION 'Esercizio % non aperto: quote non modificabili', _year;
  END IF;
  SELECT id INTO _old FROM public.treasury_fee_schedules WHERE fiscal_year = _year AND category = _category AND superseded_at IS NULL FOR UPDATE;
  _new := gen_random_uuid();
  IF _old IS NOT NULL THEN
    UPDATE public.treasury_fee_schedules SET superseded_at = now(), superseded_by = NULL WHERE id = _old;
  END IF;
  INSERT INTO public.treasury_fee_schedules (id, fiscal_year, category, amount, exempt, resolution_number, resolution_date, document_path, document_name, notes, created_by)
  VALUES (_new, _year, _category, CASE WHEN _exempt THEN 0 ELSE _amount END, _exempt, NULLIF(trim(_resolution_number),''), _resolution_date,
          NULLIF(_document_path,''), NULLIF(_document_name,''), NULLIF(trim(_notes),''), auth.uid());
  IF _old IS NOT NULL THEN
    ALTER TABLE public.treasury_fee_schedules DISABLE TRIGGER treasury_fee_immutable;
    UPDATE public.treasury_fee_schedules SET superseded_by = _new WHERE id = _old;
    ALTER TABLE public.treasury_fee_schedules ENABLE TRIGGER treasury_fee_immutable;
  END IF;
  RETURN _new;
END $$;
REVOKE ALL ON FUNCTION public.treasury_set_fee(integer,text,numeric,boolean,text,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.treasury_set_fee(integer,text,numeric,boolean,text,date,text,text,text) TO authenticated;

-- 2026 fees as stated (only if not already registered). No resolution reference invented.
INSERT INTO public.treasury_fee_schedules (fiscal_year, category, amount, exempt, notes, created_by)
SELECT 2026, c, a, e, 'Valori iniziali del modello 2026: inserire gli estremi della delibera CD', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES ('Fondatore',100,false),('Ordinario',50,false),('Sostenitore',250,false),('Onorario',0,true)) v(c,a,e)
WHERE EXISTS (SELECT 1 FROM public.treasury_fiscal_years WHERE year = 2026)
  AND NOT EXISTS (SELECT 1 FROM public.treasury_fee_schedules WHERE fiscal_year = 2026 AND category = v.c);

-- 3) Board resolution documents in the private treasury bucket.
DROP POLICY IF EXISTS treasury_docs_resolution_insert ON storage.objects;
CREATE POLICY treasury_docs_resolution_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='treasury-documents' AND public.is_treasury_user(auth.uid())
  AND lower(name) ~ '^delibere/[0-9]{4}/[0-9a-f-]+\.(pdf|jpg|jpeg|png)$'
);

COMMIT;
NOTIFY pgrst, 'reload schema';
