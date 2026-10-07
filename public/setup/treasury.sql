-- Epocar Tesoreria: execute once in your external instance SQL editor.
-- Requires public.has_role(uuid, app_role), public.user_roles and public.profiles.

-- 1) New role (must run outside the main transaction).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'treasurer';

BEGIN;

-- Treasury access helper (text compare so it works in the same script as ADD VALUE).
CREATE OR REPLACE FUNCTION public.is_treasury_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text IN ('admin','treasurer'))
$$;

-- 2) Fiscal years (open / closed)
CREATE TABLE public.treasury_fiscal_years (
  year integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.treasury_fiscal_years TO authenticated;
GRANT ALL ON public.treasury_fiscal_years TO service_role;
ALTER TABLE public.treasury_fiscal_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY tfy_read ON public.treasury_fiscal_years FOR SELECT TO authenticated USING (public.is_treasury_user(auth.uid()));
CREATE POLICY tfy_insert ON public.treasury_fiscal_years FOR INSERT TO authenticated WITH CHECK (public.is_treasury_user(auth.uid()) AND status = 'open');
CREATE POLICY tfy_admin_update ON public.treasury_fiscal_years FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.treasury_fiscal_years (year) VALUES (2026) ON CONFLICT DO NOTHING;

-- 3) Member register (soci). Optional link to a site user; no duplicated profile data required.
CREATE TABLE public.association_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  full_name text NOT NULL UNIQUE CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120),
  member_number text CHECK (char_length(member_number) <= 20),
  category text NOT NULL CHECK (category IN ('Fondatore','Ordinario','Sostenitore','Onorario')),
  admission_date date,
  notes text CHECK (char_length(notes) <= 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.association_members TO authenticated;
GRANT ALL ON public.association_members TO service_role;
ALTER TABLE public.association_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_read ON public.association_members FOR SELECT TO authenticated USING (public.is_treasury_user(auth.uid()));
CREATE POLICY am_insert ON public.association_members FOR INSERT TO authenticated WITH CHECK (public.is_treasury_user(auth.uid()));
CREATE POLICY am_update ON public.association_members FOR UPDATE TO authenticated USING (public.is_treasury_user(auth.uid())) WITH CHECK (public.is_treasury_user(auth.uid()));

-- 4) Transactions (soft delete only)
CREATE TABLE public.treasury_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL REFERENCES public.treasury_fiscal_years(year),
  movement_number integer,
  transaction_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('Entrata','Uscita')),
  excel_code text NOT NULL CHECK (excel_code ~ '^[A-Z]\.(E|U)\.[0-9]+$'),
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 500),
  subject text CHECK (char_length(subject) <= 200),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('Bonifico','Contanti','Carta','Addebito/SDD','Assegno','Altro')),
  account text NOT NULL CHECK (account IN ('Banca','Cassa','Carta','PayPal/Online','Altro')),
  event_id uuid,
  member_id uuid REFERENCES public.association_members(id),
  document_number text CHECK (char_length(document_number) <= 100),
  document_date date,
  attachment_path text CHECK (attachment_path ~ '^[0-9]{4}/[0-9a-f-]+/[0-9a-f-]+\.(pdf|jpg|jpeg|png)$'),
  attachment_name text CHECK (char_length(attachment_name) <= 255),
  notes text CHECK (char_length(notes) <= 1000),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CHECK (extract(year FROM transaction_date)::int = fiscal_year),
  CHECK (substr(excel_code,3,1) = CASE WHEN type='Entrata' THEN 'E' ELSE 'U' END)
);
CREATE INDEX treasury_tx_year_idx ON public.treasury_transactions (fiscal_year, transaction_date) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.treasury_transactions TO authenticated;
GRANT ALL ON public.treasury_transactions TO service_role;
ALTER TABLE public.treasury_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tt_read ON public.treasury_transactions FOR SELECT TO authenticated USING (public.is_treasury_user(auth.uid()));
CREATE POLICY tt_insert ON public.treasury_transactions FOR INSERT TO authenticated WITH CHECK (public.is_treasury_user(auth.uid()) AND created_by = auth.uid() AND deleted_at IS NULL);
CREATE POLICY tt_update ON public.treasury_transactions FOR UPDATE TO authenticated USING (public.is_treasury_user(auth.uid())) WITH CHECK (public.is_treasury_user(auth.uid()));
-- No DELETE grant: rows are only soft-deleted.

-- 5) Budget
CREATE TABLE public.treasury_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL REFERENCES public.treasury_fiscal_years(year),
  excel_code text NOT NULL CHECK (excel_code ~ '^[A-Z]\.(E|U)\.[0-9]+$'),
  description text CHECK (char_length(description) <= 300),
  planned_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, excel_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_budgets TO authenticated;
GRANT ALL ON public.treasury_budgets TO service_role;
ALTER TABLE public.treasury_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tb_all ON public.treasury_budgets FOR ALL TO authenticated USING (public.is_treasury_user(auth.uid())) WITH CHECK (public.is_treasury_user(auth.uid()));

-- 6) Closed-year lock + timestamps
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
      IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND NOT public.has_role(auth.uid(),'admin') THEN
        RAISE EXCEPTION 'Solo un amministratore può ripristinare un movimento eliminato';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER treasury_tx_guard BEFORE INSERT OR UPDATE ON public.treasury_transactions FOR EACH ROW EXECUTE FUNCTION public.treasury_guard_year();
CREATE TRIGGER treasury_budget_guard BEFORE INSERT OR UPDATE ON public.treasury_budgets FOR EACH ROW EXECUTE FUNCTION public.treasury_guard_year();
CREATE TRIGGER association_members_updated BEFORE UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Immutable audit log
CREATE TABLE public.treasury_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  operation text NOT NULL CHECK (operation IN ('create','update','delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.treasury_audit_log TO authenticated;
GRANT ALL ON public.treasury_audit_log TO service_role;
ALTER TABLE public.treasury_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tal_read ON public.treasury_audit_log FOR SELECT TO authenticated USING (public.is_treasury_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.treasury_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _op text;
BEGIN
  _op := CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'DELETE' THEN 'delete' ELSE 'update' END;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'treasury_transactions' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN _op := 'delete'; END IF;
  INSERT INTO public.treasury_audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, _op,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
          auth.uid());
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER treasury_tx_audit AFTER INSERT OR UPDATE ON public.treasury_transactions FOR EACH ROW EXECUTE FUNCTION public.treasury_audit();
CREATE TRIGGER treasury_budget_audit AFTER INSERT OR UPDATE OR DELETE ON public.treasury_budgets FOR EACH ROW EXECUTE FUNCTION public.treasury_audit();
CREATE TRIGGER association_members_audit AFTER INSERT OR UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.treasury_audit();
CREATE TRIGGER treasury_years_audit AFTER INSERT OR UPDATE ON public.treasury_fiscal_years FOR EACH ROW EXECUTE FUNCTION public.treasury_audit();

CREATE OR REPLACE FUNCTION public.treasury_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'treasury_audit_log is immutable'; END $$;
CREATE TRIGGER treasury_audit_no_update BEFORE UPDATE OR DELETE ON public.treasury_audit_log FOR EACH ROW EXECUTE FUNCTION public.treasury_audit_immutable();

-- 8) Private storage for receipts (PDF / JPG / PNG, 10 MB)
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES
('treasury-documents','treasury-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY treasury_docs_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='treasury-documents' AND public.is_treasury_user(auth.uid()));
CREATE POLICY treasury_docs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='treasury-documents' AND public.is_treasury_user(auth.uid())
  AND lower(name) ~ '^[0-9]{4}/[0-9a-f-]+/[0-9a-f-]+\.(pdf|jpg|jpeg|png)$'
);
-- No UPDATE/DELETE on stored receipts: replacing uploads a new file and keeps the old one for audit.

COMMIT;
NOTIFY pgrst, 'reload schema';
