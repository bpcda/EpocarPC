-- EPOCAR — REVISIONE MANUALE, NON ESEGUITO SUL DATABASE ESTERNO.
-- Solo sul database ESTERNO DEL SITO, mai sulla Tesoreria Django.
-- Default: prova completa con ROLLBACK. Leggere docs/relink-public-member-a.md.
-- Non cambiare email, tessera, delibere, domande, bootstrap, proiezione, quote o file.
-- A/B e socio sono valori comunicati dall'utente, non ricavati da un DB accessibile qui.

-- BLOCCO 1: sola lettura. Esaminare definizioni, trigger e permessi PRIMA del blocco 2.
SELECT t.tgrelid::regclass AS relation, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       p.oid::regprocedure AS function_signature, pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND t.tgrelid IN
  ('public.association_members'::regclass, 'public.user_roles'::regclass)
ORDER BY t.tgrelid::regclass::text, t.tgname;

-- Impronta del codice installato: non è un hash Auth né un segreto.
-- Copiarla nel blocco 2 SOLO dopo revisione delle definizioni e dei percorsi di sync.
WITH definitions AS (
  SELECT 'trigger:' || t.tgrelid::regclass::text || ':' || t.tgname AS k,
         pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text || ':' || pg_get_functiondef(t.tgfoid) AS v
  FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
    ('public.association_members'::regclass, 'public.user_roles'::regclass)
  UNION ALL
  SELECT 'function:' || p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN
    ('treasury_sync_apply','treasury_sync_bootstrap_member_update','treasury_sync_bootstrap_ack',
     'member_public_upsert','member_update_v2','member_public_role_sync','treasury_sync_members',
     'membership_decide','member_category_role')
)
SELECT md5(string_agg(k || ':' || v, E'\n' ORDER BY k)) AS reviewed_code_fingerprint FROM definitions;

SELECT id AS auth_user_id, email FROM auth.users
WHERE id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60');
SELECT user_id, role FROM public.user_roles
WHERE user_id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60') ORDER BY user_id, role;
SELECT id, user_id, email, category, card_number, active, admission_date, resolution_ref, resolution_date
FROM public.association_members
WHERE id = '1601d3a0-8d64-46be-a7b4-c1d2aaee2552'
   OR user_id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60');
SELECT external_member_id, treasury_member_id FROM public.treasury_bootstrap_links
WHERE treasury_member_id = '3af0240f-e43a-440b-a080-7b50af3939e6'
   OR external_member_id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60');
SELECT user_id, treasury_member_id, application_id, membership_status, category, card_number,
       admission_date, treasury_updated_at FROM public.member_public_status
WHERE treasury_member_id = '3af0240f-e43a-440b-a080-7b50af3939e6'
   OR user_id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60');
SELECT id, user_id, status, member_id, treasury_member_id FROM public.membership_applications
WHERE member_id = '1601d3a0-8d64-46be-a7b4-c1d2aaee2552'
   OR treasury_member_id = '3af0240f-e43a-440b-a080-7b50af3939e6'
   OR user_id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60');

-- BLOCCO 2: eseguire INTERAMENTE nella stessa richiesta SQL, da BEGIN a ROLLBACK.
-- Dopo una prova riuscita, una NUOVA esecuzione può terminare con COMMIT anziché ROLLBACK.
-- Nessuna pausa interattiva fra UPDATE e COMMIT. Errori => ROLLBACK, mai forzare i controlli.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Lock brevi e deliberatamente conservativi: impediscono scritture concorrenti durante la correzione.
-- Codex deve prima sospendere import/outbox/retry/ack ed attendere le richieste in volo.
LOCK TABLE public.association_members, public.user_roles, public.treasury_bootstrap_links,
  public.member_public_status, public.membership_applications,
  public.association_member_events, public.treasury_audit_log IN SHARE ROW EXCLUSIVE MODE;

DO $repair$
DECLARE
  a constant uuid := '3abfb9da-4153-44e2-a84c-c38fe7a45415';
  b constant uuid := '9dbcf104-3ebe-4b4f-9023-8c6061689a60';
  mid constant uuid := '1601d3a0-8d64-46be-a7b4-c1d2aaee2552';
  tm constant uuid := '3af0240f-e43a-440b-a080-7b50af3939e6';
  reviewed constant text := 'INCOLLARE_IMPRONTA_CODICE_REVISIONATO';
  operator_id constant text := 'INSERIRE_UUID_AUTH_OPERATORE_ADMIN';
  fingerprint text;
  before_row jsonb; after_row jsonb; before_roles jsonb; after_roles jsonb;
  before_history jsonb; after_history jsonb;
  audit_count bigint; changed integer;
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'STOP: usare SQL Editor amministrativo autorizzato'; END IF;
  IF operator_id = 'INSERIRE_UUID_AUTH_OPERATORE_ADMIN'
     OR NOT EXISTS (SELECT 1 FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
                    WHERE u.id=operator_id::uuid AND r.role::text='admin') THEN
    RAISE EXCEPTION 'STOP: identificare operatore amministrativo per audit'; END IF;
  -- Solo identità audit di questa transazione; non assegna ruoli né privilegi.
  PERFORM set_config('request.jwt.claim.sub', operator_id, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',operator_id)::text, true);
  WITH definitions AS (
    SELECT 'trigger:' || t.tgrelid::regclass::text || ':' || t.tgname AS k,
           pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text || ':' || pg_get_functiondef(t.tgfoid) AS v
    FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
      ('public.association_members'::regclass, 'public.user_roles'::regclass)
    UNION ALL
    SELECT 'function:' || p.oid::regprocedure::text, pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('treasury_sync_apply','treasury_sync_bootstrap_member_update','treasury_sync_bootstrap_ack',
       'member_public_upsert','member_update_v2','member_public_role_sync','treasury_sync_members',
       'membership_decide','member_category_role')
  ) SELECT md5(string_agg(k || ':' || v,E'\n' ORDER BY k)) INTO fingerprint FROM definitions;
  IF fingerprint IS DISTINCT FROM reviewed THEN RAISE EXCEPTION 'STOP: codice non revisionato o cambiato'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
             AND tgrelid IN ('public.association_members'::regclass,'public.user_roles'::regclass)
             AND tgenabled NOT IN ('O','A')) THEN RAISE EXCEPTION 'STOP: trigger non attivo'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.association_members'::regclass
      AND NOT tgisinternal AND tgname IN ('association_members_link_account','association_members_sync_role',
      'association_members_card_guard','association_members_history','association_members_updated','association_members_audit')) <> 6 THEN
    RAISE EXCEPTION 'STOP: installazione trigger attesi incompleta'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.association_members'::regclass)
     OR to_regprocedure('public.epocar_guard_member_1601d3a0()') IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: RLS assente o protezione già installata (non rieseguire)'; END IF;
  PERFORM 1 FROM auth.users WHERE id IN (a,b) FOR KEY SHARE;
  IF (SELECT count(*) FROM auth.users WHERE id IN (a,b)) <> 2 THEN RAISE EXCEPTION 'STOP: account A/B mancanti'; END IF;
  SELECT to_jsonb(m) INTO before_row FROM public.association_members m WHERE id=mid FOR UPDATE;
  IF before_row IS NULL OR before_row->>'user_id' IS DISTINCT FROM b::text THEN
    RAISE EXCEPTION 'STOP: record assente o collegamento diverso da B'; END IF;
  -- Dati comunicati della Tesoreria sono precondizioni, NON valori da scrivere sul sito.
  IF before_row->>'category' IS DISTINCT FROM 'Fondatore' OR before_row->>'card_number' IS DISTINCT FROM '1'
     OR before_row->>'active' IS DISTINCT FROM 'true' OR before_row->>'admission_date' IS DISTINCT FROM '2026-10-07'
     OR before_row->>'resolution_ref' IS DISTINCT FROM '1' OR before_row->>'resolution_date' IS DISTINCT FROM '2026-10-07' THEN
    RAISE EXCEPTION 'STOP: tessera/ammissione/delibera pubbliche non coincidenti; non correggerle con questo script'; END IF;
  IF EXISTS (SELECT 1 FROM public.association_members WHERE id<>mid AND user_id IN (a,b)) THEN
    RAISE EXCEPTION 'STOP: altro record associato ad A/B'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treasury_bootstrap_links WHERE external_member_id=a AND treasury_member_id=tm)
     OR EXISTS (SELECT 1 FROM public.treasury_bootstrap_links WHERE external_member_id=b
                OR (external_member_id=a AND treasury_member_id<>tm) OR (treasury_member_id=tm AND external_member_id<>a)) THEN
    RAISE EXCEPTION 'STOP: bootstrap non canonico A o B ha un altro collegamento'; END IF;
  IF EXISTS (SELECT 1 FROM public.member_public_status WHERE user_id=b
       OR (user_id=a AND treasury_member_id<>tm) OR (treasury_member_id=tm AND user_id<>a)) THEN
    RAISE EXCEPTION 'STOP: proiezione in conflitto; serve procedura separata, non trasferirla qui'; END IF;
  IF EXISTS (SELECT 1 FROM public.membership_applications
      WHERE (treasury_member_id=tm OR member_id=mid) AND user_id IS DISTINCT FROM a)
     OR EXISTS (SELECT 1 FROM public.membership_applications WHERE user_id IN (a,b)
         AND (status IN ('submitted','review') OR (treasury_member_id IS NOT NULL AND treasury_member_id<>tm)
              OR (member_id IS NOT NULL AND member_id<>mid))) THEN
    RAISE EXCEPTION 'STOP: domanda storica o pendente conflittuale; non cambiare il richiedente'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=a AND role::text IN ('ordinary','supporter')) THEN
    RAISE EXCEPTION 'STOP: A ha categoria diversa; non revocarla implicitamente'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.user_id,r.role::text),'[]') INTO before_roles
    FROM public.user_roles r WHERE user_id=b OR (user_id=a AND role::text<>'founder');
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') INTO before_history
    FROM public.association_member_events e WHERE member_id=mid;
  SELECT count(*) INTO audit_count FROM public.treasury_audit_log WHERE table_name='association_members' AND record_id=mid;

  -- Protezione persistente limitata a QUESTO record, inclusi writer service_role.
  -- Non sostituisce/disattiva alcun trigger; rifiuta il ritorno a B o NULL e la modifica dell'ID.
  EXECUTE $ddl$
    CREATE FUNCTION public.epocar_guard_member_1601d3a0() RETURNS trigger
    LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
    BEGIN
      IF TG_OP='UPDATE' AND OLD.id='1601d3a0-8d64-46be-a7b4-c1d2aaee2552'::uuid
         AND NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'canonical_member_id_locked'; END IF;
      IF NEW.id='1601d3a0-8d64-46be-a7b4-c1d2aaee2552'::uuid
         AND NEW.user_id IS DISTINCT FROM '3abfb9da-4153-44e2-a84c-c38fe7a45415'::uuid THEN
        RAISE EXCEPTION 'canonical_member_account_locked'; END IF;
      RETURN NEW;
    END $guard$
  $ddl$;
  EXECUTE 'REVOKE ALL ON FUNCTION public.epocar_guard_member_1601d3a0() FROM PUBLIC, anon, authenticated, service_role';
  EXECUTE 'CREATE TRIGGER zzzz_epocar_guard_member_1601d3a0 BEFORE INSERT OR UPDATE ON public.association_members FOR EACH ROW EXECUTE FUNCTION public.epocar_guard_member_1601d3a0()';

  -- UNICO UPDATE dati esplicito: un record, una colonna, confronto sul vecchio legame.
  UPDATE public.association_members SET user_id=a WHERE id=mid AND user_id=b;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'STOP: numero righe aggiornate diverso da uno'; END IF;
  SELECT to_jsonb(m) INTO after_row FROM public.association_members m WHERE id=mid;
  IF after_row->>'user_id' IS DISTINCT FROM a::text
     OR (after_row - ARRAY['user_id','updated_at']) IS DISTINCT FROM (before_row - ARRAY['user_id','updated_at']) THEN
    RAISE EXCEPTION 'STOP: collegamento fallito o altri campi modificati'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.user_id,r.role::text),'[]') INTO after_roles
    FROM public.user_roles r WHERE user_id=b OR (user_id=a AND role::text<>'founder');
  IF before_roles IS DISTINCT FROM after_roles OR NOT EXISTS
     (SELECT 1 FROM public.user_roles WHERE user_id=a AND role::text='founder') THEN
    RAISE EXCEPTION 'STOP: effetti sui ruoli inattesi'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') INTO after_history
    FROM public.association_member_events e WHERE member_id=mid;
  IF before_history IS DISTINCT FROM after_history THEN RAISE EXCEPTION 'STOP: storico associativo modificato'; END IF;
  IF (SELECT count(*) FROM public.treasury_audit_log WHERE table_name='association_members' AND record_id=mid) <> audit_count+1
     OR NOT EXISTS (SELECT 1 FROM public.treasury_audit_log WHERE table_name='association_members' AND record_id=mid
       AND operation='update' AND changed_by=operator_id::uuid AND old_data=before_row AND new_data=after_row) THEN
    RAISE EXCEPTION 'STOP: audit del ricollegamento assente/inatteso'; END IF;
  RAISE NOTICE 'Verificato: record pubblico B→A; solo user_id/updated_at, audit append-only, B conserva tutti i ruoli.';
END $repair$;

-- Verifica finale prima del termine della transazione (allowlist, niente credenziali).
SELECT id, user_id, category, card_number, active, admission_date, resolution_ref, resolution_date
FROM public.association_members WHERE id='1601d3a0-8d64-46be-a7b4-c1d2aaee2552';
SELECT user_id, role FROM public.user_roles
WHERE user_id IN ('3abfb9da-4153-44e2-a84c-c38fe7a45415','9dbcf104-3ebe-4b4f-9023-8c6061689a60') ORDER BY user_id,role;
SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.association_members'::regclass AND tgname='zzzz_epocar_guard_member_1601d3a0';
ROLLBACK; -- DEFAULT SICURO: nulla persiste. Solo dopo revisione/prova sostituire con COMMIT.