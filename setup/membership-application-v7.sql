-- EPOCAR · Domanda di ammissione elettronica (v7) · rieseguibile
-- Eseguire DOPO membership-sync-v6.sql. Estende membership_applications (nessuna nuova tabella),
-- non modifica il contratto treasury-sync e non concede alcuna decisione al browser.
BEGIN;

-- 1) Campi dichiarati dal richiedente (tutti nullable: le domande storiche restano valide)
ALTER TABLE public.membership_applications
  ADD COLUMN IF NOT EXISTS first_name text CHECK (char_length(first_name) <= 60),
  ADD COLUMN IF NOT EXISTS last_name text CHECK (char_length(last_name) <= 60),
  ADD COLUMN IF NOT EXISTS birth_date date CHECK (birth_date BETWEEN DATE '1900-01-01' AND current_date),
  ADD COLUMN IF NOT EXISTS birth_place text CHECK (char_length(birth_place) <= 80),
  ADD COLUMN IF NOT EXISTS tax_code text CHECK (tax_code ~ '^[A-Z0-9]{16}$'),
  ADD COLUMN IF NOT EXISTS phone text CHECK (phone ~ '^\+?[0-9 ]{6,20}$'),
  ADD COLUMN IF NOT EXISTS address text CHECK (char_length(address) <= 120),
  ADD COLUMN IF NOT EXISTS postal_code text CHECK (postal_code ~ '^[0-9]{5}$'),
  ADD COLUMN IF NOT EXISTS city text CHECK (char_length(city) <= 80),
  ADD COLUMN IF NOT EXISTS province text CHECK (province ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS motivation text CHECK (char_length(motivation) <= 1000),
  ADD COLUMN IF NOT EXISTS applicant_notes text CHECK (char_length(applicant_notes) <= 1000),
  -- Dichiarazioni separate: data/ora di accettazione (NULL = non accettata)
  ADD COLUMN IF NOT EXISTS statute_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS regulation_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS admission_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS rules_commitment_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS communications_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS declarations_version text CHECK (char_length(declarations_version) <= 40),
  ADD COLUMN IF NOT EXISTS application_kind text NOT NULL DEFAULT 'upload' CHECK (application_kind IN ('upload','electronic'));

-- 2) Le domande elettroniche non richiedono il modulo firmato caricato.
ALTER TABLE public.membership_applications DROP CONSTRAINT IF EXISTS membership_applications_file_chk;
ALTER TABLE public.membership_applications ADD CONSTRAINT membership_applications_file_chk
  CHECK (status = 'draft' OR application_kind = 'electronic' OR (file_path IS NOT NULL AND filename IS NOT NULL));

-- 3) Colonne modificabili dal richiedente (solo in bozza: policy + guard v6 invariati)
REVOKE UPDATE ON public.membership_applications FROM authenticated;
GRANT UPDATE (full_name, email, file_path, filename, status, requested_category,
  first_name, last_name, birth_date, birth_place, tax_code, phone, address, postal_code, city, province,
  motivation, applicant_notes, statute_accepted_at, regulation_accepted_at, admission_requested_at,
  rules_commitment_at, privacy_accepted_at, communications_consent_at, declarations_version, application_kind)
  ON public.membership_applications TO authenticated;

-- 4) Validazione server all'invio e submitted_at deciso dal database
CREATE OR REPLACE FUNCTION public.membership_applications_submit_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    IF coalesce(auth.role(), '') <> 'service_role' THEN NEW.submitted_at := now(); END IF;
    IF NEW.application_kind = 'electronic' AND (
         nullif(trim(NEW.first_name),'') IS NULL OR nullif(trim(NEW.last_name),'') IS NULL
      OR NEW.birth_date IS NULL OR nullif(trim(NEW.birth_place),'') IS NULL OR NEW.tax_code IS NULL
      OR NEW.phone IS NULL OR nullif(trim(NEW.address),'') IS NULL OR NEW.postal_code IS NULL
      OR nullif(trim(NEW.city),'') IS NULL OR NEW.province IS NULL OR NEW.requested_category IS NULL
      OR NEW.statute_accepted_at IS NULL OR NEW.regulation_accepted_at IS NULL OR NEW.admission_requested_at IS NULL
      OR NEW.rules_commitment_at IS NULL OR NEW.privacy_accepted_at IS NULL OR NEW.declarations_version IS NULL) THEN
      RAISE EXCEPTION 'Domanda incompleta' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS membership_applications_submit_check ON public.membership_applications;
CREATE TRIGGER membership_applications_submit_check BEFORE INSERT OR UPDATE ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.membership_applications_submit_check();

COMMIT;
