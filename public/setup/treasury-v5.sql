-- Epocar Tesoreria v5 (ammissione soci secondo lo Statuto): execute AFTER association.sql and treasury.sql ... treasury-v4.sql. Safe to re-run.
-- * Membership applications have a status: draft, submitted, review, approved, rejected.
--   Submitting an application never makes anyone a member.
-- * Only a Board (CD) decision, registered through membership_decide(), creates the member,
--   records admission date/category/resolution and assigns the progressive card number.
-- * Card numbers are never assigned before approval, never reused, immutable except through
--   treasury_correct_card() (admin, mandatory reason, logged).
-- * Every relevant fact is stored in association_member_events (immutable) for the libro degli associati.
-- * Card numbers generated automatically by v3 (never formally assigned) are cleared.

BEGIN;

-- 1) Application status ---------------------------------------------------------------
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted';
ALTER TABLE public.membership_applications DROP CONSTRAINT IF EXISTS membership_applications_status_chk;
ALTER TABLE public.membership_applications ADD CONSTRAINT membership_applications_status_chk
  CHECK (status IN ('draft','submitted','review','approved','rejected'));
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS requested_category text CHECK (requested_category IN ('Ordinario','Sostenitore'));
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS decided_by uuid;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS resolution_ref text CHECK (char_length(resolution_ref) <= 80);
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS resolution_date date;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS decision_notes text CHECK (char_length(decision_notes) <= 1000);
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.association_members(id);
-- Drafts may be saved before the signed form is attached.
ALTER TABLE public.membership_applications ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE public.membership_applications ALTER COLUMN filename DROP NOT NULL;
ALTER TABLE public.membership_applications DROP CONSTRAINT IF EXISTS membership_applications_file_chk;
ALTER TABLE public.membership_applications ADD CONSTRAINT membership_applications_file_chk
  CHECK (status = 'draft' OR (file_path IS NOT NULL AND filename IS NOT NULL));
UPDATE public.membership_applications SET submitted_at = created_at WHERE submitted_at IS NULL AND status <> 'draft';

-- Applicants: create a draft or a submitted application; edit only while draft; never self-approve.
DROP POLICY IF EXISTS membership_submit ON public.membership_applications;
CREATE POLICY membership_submit ON public.membership_applications FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND status IN ('draft','submitted') AND member_id IS NULL AND decided_at IS NULL
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='statute' AND path=statute_path)
  AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='membership_form' AND path=form_path)
  AND (file_path IS NULL OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='membership-submissions' AND name=file_path))
);
GRANT UPDATE (full_name, email, file_path, filename, status, requested_category) ON public.membership_applications TO authenticated;
DROP POLICY IF EXISTS membership_draft_update ON public.membership_applications;
CREATE POLICY membership_draft_update ON public.membership_applications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft')
  WITH CHECK (user_id = auth.uid() AND status IN ('draft','submitted')
    AND (file_path IS NULL OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='membership-submissions' AND name=file_path)));
-- Upload of the signed form is also allowed while the application is a draft.
DROP POLICY IF EXISTS membership_files_insert ON storage.objects;
CREATE POLICY membership_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='membership-submissions' AND (storage.foldername(name))[1]=auth.uid()::text
 AND public.is_allowed_upload_ext(name)
 AND (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='membership-submissions' AND (storage.foldername(o.name))[1]=auth.uid()::text) < 3
 AND NOT EXISTS (SELECT 1 FROM public.membership_applications WHERE user_id=auth.uid() AND status <> 'draft')
 AND EXISTS (SELECT 1 FROM public.association_documents WHERE kind='membership_form'));

-- Who can register Board decisions on admissions.
CREATE OR REPLACE FUNCTION public.can_manage_admissions(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid
    AND role::text IN ('admin','president','vice_president','secretary','treasurer'))
$$;
DROP POLICY IF EXISTS membership_read ON public.membership_applications;
CREATE POLICY membership_read ON public.membership_applications FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.has_role(auth.uid(),'staff') OR public.can_manage_admissions(auth.uid()));

-- 2) Member register: status and cessation -------------------------------------------
ALTER TABLE public.association_members ADD COLUMN IF NOT EXISTS ceased_on date;
ALTER TABLE public.association_members ADD COLUMN IF NOT EXISTS resolution_ref text CHECK (char_length(resolution_ref) <= 80);
ALTER TABLE public.association_members ADD COLUMN IF NOT EXISTS resolution_date date;

-- 3) Immutable association history (libro degli associati) ---------------------------
CREATE TABLE IF NOT EXISTS public.association_member_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.association_members(id),
  application_id uuid REFERENCES public.membership_applications(id),
  event_type text NOT NULL CHECK (event_type IN ('application_submitted','application_review','approved','rejected','card_assigned','card_corrected','category_changed','ceased','reinstated')),
  category text,
  card_number integer,
  resolution_ref text,
  resolution_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.association_member_events TO authenticated;
GRANT ALL ON public.association_member_events TO service_role;
ALTER TABLE public.association_member_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ame_read ON public.association_member_events;
CREATE POLICY ame_read ON public.association_member_events FOR SELECT TO authenticated
  USING (public.is_treasury_user(auth.uid()) OR public.can_manage_admissions(auth.uid()));
CREATE OR REPLACE FUNCTION public.association_member_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Lo storico associativo non può essere modificato'; END $$;
DROP TRIGGER IF EXISTS ame_immutable ON public.association_member_events;
CREATE TRIGGER ame_immutable BEFORE UPDATE OR DELETE ON public.association_member_events
  FOR EACH ROW EXECUTE FUNCTION public.association_member_events_immutable();

-- Application submitted -> history (AFTER INSERT for new rows, BEFORE UPDATE for draft -> submitted)
CREATE OR REPLACE FUNCTION public.membership_applications_history_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    INSERT INTO public.association_member_events (application_id, event_type, category, created_by)
    VALUES (NEW.id, 'application_submitted', NEW.requested_category, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.membership_applications_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    NEW.submitted_at := now();
    INSERT INTO public.association_member_events (application_id, event_type, category, created_by)
    VALUES (NEW.id, 'application_submitted', NEW.requested_category, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS membership_applications_history ON public.membership_applications;
CREATE TRIGGER membership_applications_history BEFORE UPDATE OF status ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.membership_applications_history();
CREATE OR REPLACE FUNCTION public.membership_applications_submitted_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.status = 'submitted' THEN NEW.submitted_at := now(); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS membership_applications_submitted_at ON public.membership_applications;
CREATE TRIGGER membership_applications_submitted_at BEFORE INSERT ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.membership_applications_submitted_at();
DROP TRIGGER IF EXISTS membership_applications_history_ins ON public.membership_applications;
CREATE TRIGGER membership_applications_history_ins AFTER INSERT ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.membership_applications_history_ins();

-- Category change / cessation on the register -> history
CREATE OR REPLACE FUNCTION public.association_members_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    INSERT INTO public.association_member_events (member_id, event_type, category, card_number, notes, created_by)
    VALUES (NEW.id, 'category_changed', NEW.category, NEW.card_number, 'Da ' || OLD.category, auth.uid());
  END IF;
  IF OLD.active AND NOT NEW.active THEN
    INSERT INTO public.association_member_events (member_id, event_type, card_number, notes, created_by)
    VALUES (NEW.id, 'ceased', NEW.card_number, NEW.ceased_on::text, auth.uid());
  ELSIF NEW.active AND NOT OLD.active THEN
    INSERT INTO public.association_member_events (member_id, event_type, card_number, created_by)
    VALUES (NEW.id, 'reinstated', NEW.card_number, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS association_members_history ON public.association_members;
CREATE TRIGGER association_members_history AFTER UPDATE OF category, active ON public.association_members
  FOR EACH ROW EXECUTE FUNCTION public.association_members_history();

-- 4) Card number: only on approval, never reused, immutable ---------------------------
ALTER TABLE public.association_members ALTER COLUMN card_number DROP DEFAULT;
ALTER TABLE public.association_members ALTER COLUMN card_number DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.association_members_card_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.card_number IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.card_number IS DISTINCT FROM OLD.card_number) THEN
    IF COALESCE(current_setting('epocar.card_change', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Il numero tessera si assegna solo con l''approvazione del Consiglio Direttivo';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS association_members_card_guard ON public.association_members;
CREATE TRIGGER association_members_card_guard BEFORE INSERT OR UPDATE ON public.association_members
  FOR EACH ROW EXECUTE FUNCTION public.association_members_card_guard();

-- Only effective members (card assigned, active) receive the associative role on their account.
CREATE OR REPLACE FUNCTION public.association_members_sync_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role text := public.member_category_role(NEW.category);
BEGIN
  IF NEW.user_id IS NULL OR NOT NEW.active OR NEW.card_number IS NULL THEN RETURN NEW; END IF;
  DELETE FROM public.user_roles WHERE user_id = NEW.user_id
    AND role::text IN ('founder','ordinary','supporter') AND role::text IS DISTINCT FROM _role;
  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, _role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS association_members_sync_role ON public.association_members;
CREATE TRIGGER association_members_sync_role AFTER INSERT OR UPDATE OF user_id, category, active, card_number ON public.association_members
  FOR EACH ROW EXECUTE FUNCTION public.association_members_sync_role();

-- Internal: assign the next card number (sequence = safe under concurrent approvals).
CREATE OR REPLACE FUNCTION public.association_assign_card(_member uuid, _ref text, _date date, _app uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  SELECT card_number INTO _n FROM public.association_members WHERE id = _member FOR UPDATE;
  IF _n IS NOT NULL THEN RETURN _n; END IF;
  _n := nextval('public.association_members_card_seq');
  PERFORM set_config('epocar.card_change', 'on', true);
  UPDATE public.association_members SET card_number = _n WHERE id = _member;
  PERFORM set_config('epocar.card_change', 'off', true);
  INSERT INTO public.association_member_events (member_id, application_id, event_type, card_number, resolution_ref, resolution_date, created_by)
  VALUES (_member, _app, 'card_assigned', _n, _ref, _date, auth.uid());
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.association_assign_card(uuid, text, date, uuid) FROM PUBLIC, authenticated;

-- Board decision on an application.
CREATE OR REPLACE FUNCTION public.membership_decide(
  _application uuid, _decision text, _category text DEFAULT NULL, _admission_date date DEFAULT NULL,
  _resolution_ref text DEFAULT NULL, _resolution_date date DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.membership_applications; _member uuid; _uid uuid;
BEGIN
  IF NOT public.can_manage_admissions(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO a FROM public.membership_applications WHERE id = _application FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Domanda non trovata'; END IF;
  IF a.status IN ('approved','rejected') THEN RAISE EXCEPTION 'Domanda già decisa'; END IF;
  IF a.status = 'draft' THEN RAISE EXCEPTION 'La domanda è ancora in bozza'; END IF;

  IF _decision = 'review' THEN
    UPDATE public.membership_applications SET status = 'review' WHERE id = a.id;
    INSERT INTO public.association_member_events (application_id, event_type, notes, created_by) VALUES (a.id, 'application_review', _notes, auth.uid());
    RETURN NULL;
  ELSIF _decision = 'rejected' THEN
    IF _resolution_date IS NULL THEN RAISE EXCEPTION 'Indica la data della delibera'; END IF;
    UPDATE public.membership_applications SET status = 'rejected', decided_at = now(), decided_by = auth.uid(),
      resolution_ref = _resolution_ref, resolution_date = _resolution_date, decision_notes = _notes WHERE id = a.id;
    INSERT INTO public.association_member_events (application_id, event_type, resolution_ref, resolution_date, notes, created_by)
    VALUES (a.id, 'rejected', _resolution_ref, _resolution_date, _notes, auth.uid());
    RETURN NULL;
  ELSIF _decision <> 'approved' THEN
    RAISE EXCEPTION 'Decisione non valida';
  END IF;

  IF _category NOT IN ('Fondatore','Ordinario','Sostenitore','Onorario') THEN RAISE EXCEPTION 'Categoria non valida'; END IF;
  IF _resolution_date IS NULL OR _admission_date IS NULL THEN RAISE EXCEPTION 'Indica data della delibera e data di ammissione'; END IF;

  -- Reuse the register entry of this account or email if present (no duplicates).
  SELECT id INTO _member FROM public.association_members
  WHERE user_id = a.user_id OR (email IS NOT NULL AND lower(email) = lower(a.email)) ORDER BY (user_id = a.user_id) DESC NULLS LAST LIMIT 1;
  IF _member IS NULL THEN
    INSERT INTO public.association_members (user_id, full_name, email, category, admission_date, active, resolution_ref, resolution_date)
    VALUES (a.user_id, a.full_name, lower(a.email), _category, _admission_date, true, _resolution_ref, _resolution_date)
    RETURNING id INTO _member;
  ELSE
    UPDATE public.association_members SET user_id = COALESCE(user_id, a.user_id), email = COALESCE(email, lower(a.email)),
      category = _category, admission_date = _admission_date, active = true, ceased_on = NULL,
      resolution_ref = _resolution_ref, resolution_date = _resolution_date
    WHERE id = _member;
  END IF;

  UPDATE public.membership_applications SET status = 'approved', decided_at = now(), decided_by = auth.uid(),
    resolution_ref = _resolution_ref, resolution_date = _resolution_date, decision_notes = _notes, member_id = _member WHERE id = a.id;
  INSERT INTO public.association_member_events (member_id, application_id, event_type, category, resolution_ref, resolution_date, notes, created_by)
  VALUES (_member, a.id, 'approved', _category, _resolution_ref, _resolution_date, _notes, auth.uid());
  PERFORM public.association_assign_card(_member, _resolution_ref, _resolution_date, a.id);
  RETURN _member;
END $$;
REVOKE ALL ON FUNCTION public.membership_decide(uuid, text, text, date, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_decide(uuid, text, text, date, text, date, text) TO authenticated;

-- Admission already deliberated for a member entered directly in the register (e.g. founders, paper applications).
CREATE OR REPLACE FUNCTION public.member_register_admission(_member uuid, _admission_date date, _resolution_ref text, _resolution_date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cat text;
BEGIN
  IF NOT (public.can_manage_admissions(auth.uid()) OR public.is_treasury_user(auth.uid())) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _resolution_date IS NULL OR _admission_date IS NULL THEN RAISE EXCEPTION 'Indica data della delibera e data di ammissione'; END IF;
  UPDATE public.association_members SET admission_date = _admission_date, resolution_ref = _resolution_ref, resolution_date = _resolution_date
  WHERE id = _member AND card_number IS NULL RETURNING category INTO _cat;
  IF NOT FOUND THEN RAISE EXCEPTION 'Socio non trovato o tessera già assegnata'; END IF;
  INSERT INTO public.association_member_events (member_id, event_type, category, resolution_ref, resolution_date, created_by)
  VALUES (_member, 'approved', _cat, _resolution_ref, _resolution_date, auth.uid());
  RETURN public.association_assign_card(_member, _resolution_ref, _resolution_date, NULL);
END $$;
REVOKE ALL ON FUNCTION public.member_register_admission(uuid, date, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_register_admission(uuid, date, text, date) TO authenticated;

-- Administrative correction of a card number: admin only, reason mandatory, never reuses a number already in use.
CREATE OR REPLACE FUNCTION public.treasury_correct_card(_member uuid, _new integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF char_length(trim(COALESCE(_reason,''))) < 5 THEN RAISE EXCEPTION 'Motivazione obbligatoria'; END IF;
  IF _new IS NULL OR _new < 1 THEN RAISE EXCEPTION 'Numero non valido'; END IF;
  SELECT card_number INTO _old FROM public.association_members WHERE id = _member FOR UPDATE;
  PERFORM set_config('epocar.card_change', 'on', true);
  UPDATE public.association_members SET card_number = _new WHERE id = _member;
  PERFORM set_config('epocar.card_change', 'off', true);
  IF _new > (SELECT last_value FROM public.association_members_card_seq) THEN
    PERFORM setval('public.association_members_card_seq', _new, true);
  END IF;
  INSERT INTO public.association_member_events (member_id, event_type, card_number, notes, created_by)
  VALUES (_member, 'card_corrected', _new, 'Da ' || COALESCE(_old::text,'—') || ': ' || _reason, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.treasury_correct_card(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.treasury_correct_card(uuid, integer, text) TO authenticated;

-- 5) Clean-up of card numbers that were never formally assigned ------------------------
-- v3 generated numbers automatically for every member: none of them comes from a Board decision.
-- If some numbers WERE really assigned by the Association, list them here before running, e.g. ARRAY[1,2,3].
DO $$
DECLARE keep integer[] := ARRAY[]::integer[];
BEGIN
  -- Integrity check: no other table may reference card_number.
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = ANY (c.confkey)
             WHERE c.contype = 'f' AND c.confrelid = 'public.association_members'::regclass AND a.attname = 'card_number') THEN
    RAISE EXCEPTION 'card_number è referenziato da altre tabelle: pulizia annullata';
  END IF;
  -- Only clear numbers with no "card_assigned" record (i.e. never assigned through approval).
  PERFORM set_config('epocar.card_change', 'on', true);
  UPDATE public.association_members m SET card_number = NULL
  WHERE card_number IS NOT NULL AND NOT (card_number = ANY (keep))
    AND NOT EXISTS (SELECT 1 FROM public.association_member_events e WHERE e.member_id = m.id AND e.event_type IN ('card_assigned','card_corrected'));
  PERFORM set_config('epocar.card_change', 'off', true);
  -- Restart the sequence after the highest number really assigned (1 if none): cleared numbers were never issued.
  PERFORM setval('public.association_members_card_seq',
    GREATEST(COALESCE((SELECT max(card_number) FROM public.association_members), 0), 1),
    (SELECT count(*) > 0 FROM public.association_members WHERE card_number IS NOT NULL));
  -- Roles must not be revoked automatically here: existing accounts keep their roles until the Board registers admissions.
END $$;

COMMIT;
