-- EPOCAR · account-deletion-v12.sql (rieseguibile, retrocompatibile; eseguire dopo v7)
-- Eliminazione account del PORTALE. Account portale != posizione associativa:
-- nessuna tabella della Tesoreria viene cancellata o anonimizzata; si rimuove solo il collegamento al portale.
-- Funzioni solo service_role, chiamate dalla Edge Function delete-account (JWT verificato server-side).
-- Le tabelle opzionali (domande, proiezione socio, registro soci, ordine persone) sono gestite solo se presenti.
BEGIN;

-- 1) Audit minimo e immutabile (nessuna password, token o dato della Tesoreria) ----------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor uuid NOT NULL,
  target_user uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('self','admin')),
  outcome text NOT NULL CHECK (outcome IN ('prepared','deleted','already_deleted','refused')),
  detail text CHECK (char_length(detail) <= 200),
  email_sha256 text CHECK (email_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS account_deletion_log_target_idx ON public.account_deletion_log (target_user);
CREATE INDEX IF NOT EXISTS account_deletion_log_email_idx ON public.account_deletion_log (email_sha256);
REVOKE ALL ON public.account_deletion_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_log TO authenticated;
GRANT ALL ON public.account_deletion_log TO service_role;
ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adl_admin_read ON public.account_deletion_log;
CREATE POLICY adl_admin_read ON public.account_deletion_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.account_deletion_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'account_deletion_log is immutable'; END $$;
DROP TRIGGER IF EXISTS account_deletion_log_immutable ON public.account_deletion_log;
CREATE TRIGGER account_deletion_log_immutable BEFORE UPDATE OR DELETE ON public.account_deletion_log
  FOR EACH ROW EXECUTE FUNCTION public.account_deletion_log_immutable();

-- 2) Stato dell'account (anteprima per conferma; nessun dato interno della Tesoreria) -----------------
CREATE OR REPLACE FUNCTION public.account_deletion_status(_target uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _app text; _member boolean := false; _admin boolean; _admins int;
BEGIN
  -- Fail closed before data cleanup when the RPC installation is incomplete.
  IF to_regprocedure('public.account_deletion_prepare(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.account_deletion_finalize(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'account_deletion_schema_not_ready';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.account_deletion_prepare(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.account_deletion_finalize(uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'account_deletion_schema_not_ready';
  END IF;
  IF to_regclass('public.membership_applications') IS NOT NULL THEN
    EXECUTE 'SELECT status FROM public.membership_applications WHERE user_id = $1' INTO _app USING _target;
  END IF;
  IF to_regclass('public.member_public_status') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.member_public_status WHERE user_id = $1)' INTO _member USING _target;
  END IF;
  IF NOT _member AND to_regclass('public.association_members') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.association_members WHERE user_id = $1)' INTO _member USING _target;
  END IF;
  _admin := public.has_role(_target, 'admin');
  SELECT count(*) INTO _admins FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id WHERE ur.role = 'admin';
  RETURN jsonb_build_object(
    'exists', EXISTS (SELECT 1 FROM auth.users WHERE id = _target),
    'application_status', _app,
    'is_member', _member OR coalesce(_app = 'approved', false),
    'is_admin', _admin,
    'last_admin', _admin AND _admins <= 1);
END $$;

-- 3) Pulizia dati del portale prima della cancellazione Auth -------------------------------------------
CREATE OR REPLACE FUNCTION public.account_deletion_prepare(_actor uuid, _target uuid, _mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st jsonb; _previous public.account_deletion_log; _email text; _app text; _draft_file text; _app_outcome text := 'none';
BEGIN
  IF _mode NOT IN ('self','admin') OR (_mode = 'self' AND _actor <> _target) THEN RAISE EXCEPTION 'invalid'; END IF;
  IF _mode = 'admin' AND NOT public.has_role(_actor, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Serialize last-admin checks across different target accounts too.
  PERFORM pg_advisory_xact_lock(hashtext('account_deletion:admins'));
  -- Serializza richieste concorrenti (doppio click / retry) sullo stesso account.
  PERFORM pg_advisory_xact_lock(hashtext('account_deletion:' || _target::text));
  _st := public.account_deletion_status(_target);
  IF NOT (_st->>'exists')::boolean THEN RETURN _st || jsonb_build_object('outcome','already_deleted'); END IF;
  IF (_st->>'last_admin')::boolean THEN
    INSERT INTO public.account_deletion_log (actor, target_user, mode, outcome, detail) VALUES (_actor, _target, _mode, 'refused', 'last_admin');
    RAISE EXCEPTION 'last_admin';
  END IF;
  -- A retry must not erase the original prepared evidence after a partial failure.
  SELECT * INTO _previous FROM public.account_deletion_log
    WHERE target_user = _target AND outcome = 'prepared' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN _st || jsonb_build_object('outcome','prepared','application_outcome',
      split_part(split_part(_previous.detail, 'application:', 2), ';', 1));
  END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _target;

  -- Domanda di ammissione
  _app := _st->>'application_status';
  IF _app = 'draft' THEN
    EXECUTE 'DELETE FROM public.membership_applications WHERE user_id = $1 AND status = ''draft'' RETURNING file_path' INTO _draft_file USING _target;
    _app_outcome := 'draft_deleted';
  ELSIF _app IN ('submitted','review') THEN
    EXECUTE 'UPDATE public.membership_applications SET status = ''cancelled'', cancelled_at = now(),
      public_status_message = ''Domanda ritirata: account del portale eliminato'' WHERE user_id = $1 AND status IN (''submitted'',''review'')' USING _target;
    _app_outcome := 'withdrawn';
  ELSIF _app IS NOT NULL THEN
    _app_outcome := 'kept';  -- approved / rejected / cancelled: storico conservato invariato
  END IF;

  -- Dati del portale
  UPDATE public.event_registrations SET user_id = NULL, vehicle_id = NULL, guest_name = 'Account eliminato', guest_email = NULL, answers = '{}'::jsonb
    WHERE user_id = _target OR vehicle_id IN (SELECT id FROM public.vehicles WHERE user_id = _target);
  DELETE FROM public.vehicles WHERE user_id = _target;
  IF to_regclass('public.association_people_order') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.association_people_order WHERE user_id = $1' USING _target;
  END IF;
  IF to_regclass('public.member_public_status') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.member_public_status WHERE user_id = $1' USING _target;  -- proiezione: la Tesoreria resta la fonte
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _target;
  DELETE FROM public.profiles WHERE user_id = _target;

  INSERT INTO public.account_deletion_log (actor, target_user, mode, outcome, detail, email_sha256)
  VALUES (_actor, _target, _mode, 'prepared', 'application:' || _app_outcome || CASE WHEN (_st->>'is_member')::boolean THEN ';member_kept' ELSE '' END,
          CASE WHEN _email IS NOT NULL THEN encode(extensions.digest(_email, 'sha256'), 'hex') END);
  RETURN _st || jsonb_build_object('outcome','prepared','application_outcome',_app_outcome,'draft_file',_draft_file);
END $$;

-- 4) Dopo la cancellazione Auth: scollega il registro soci (nessun altro campo della Tesoreria toccato) -
CREATE OR REPLACE FUNCTION public.account_deletion_finalize(_actor uuid, _target uuid, _mode text, _outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _outcome NOT IN ('deleted','already_deleted') OR _mode NOT IN ('self','admin') THEN RAISE EXCEPTION 'invalid'; END IF;
  IF _mode = 'self' AND _actor <> _target THEN RAISE EXCEPTION 'invalid'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = _target) THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF to_regclass('public.association_members') IS NOT NULL THEN
    EXECUTE 'UPDATE public.association_members SET user_id = NULL WHERE user_id = $1' USING _target;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_log WHERE target_user = _target AND outcome IN ('deleted','already_deleted')) THEN
    INSERT INTO public.account_deletion_log (actor, target_user, mode, outcome) VALUES (_actor, _target, _mode, _outcome);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.account_deletion_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_prepare(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_finalize(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_prepare(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_finalize(uuid, uuid, text, text) TO service_role;

-- 5) Nessun ricollegamento automatico per email dopo un'eliminazione ---------------------------------
-- Se in futuro la stessa email si registra di nuovo, il socio NON viene ricollegato da solo:
-- il tesoriere lo collega a mano impostando l'account.
DO $$ BEGIN
  IF to_regclass('public.association_members') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.association_members_link_account()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    DECLARE _uid uuid;
    BEGIN
      NEW.email := NULLIF(lower(trim(NEW.email)), '');
      IF NEW.user_id IS NULL AND NEW.email IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.account_deletion_log
                         WHERE email_sha256 = encode(extensions.digest(NEW.email, 'sha256'), 'hex')) THEN
        SELECT u.id INTO _uid FROM auth.users u
        WHERE lower(u.email) = NEW.email
          AND NOT EXISTS (SELECT 1 FROM public.association_members m WHERE m.user_id = u.id AND m.id <> NEW.id)
        LIMIT 1;
        NEW.user_id := _uid;
      END IF;
      RETURN NEW;
    END $f$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
