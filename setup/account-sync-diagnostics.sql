-- READ ONLY: run in the EXTERNAL project's SQL editor, not in the private Treasury.
-- Optional target: SET epocar.diagnostic_user_id = '<account UUID>';
-- Do not paste emails, tokens or full user rows into support tickets.

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       p.proargnames AS parameter_names, p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS user_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       md5(pg_get_functiondef(p.oid)) AS definition_fingerprint
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND
  (p.proname LIKE 'account_deletion_%' OR p.proname LIKE 'treasury_sync_bootstrap%')
ORDER BY p.proname, signature;

-- Auth foreign keys may cause a late delete failure or unintended historical cascades.
SELECT n.nspname AS schema_name, c.relname AS table_name, k.conname,
       pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE k.contype='f' AND k.confrelid='auth.users'::regclass
ORDER BY 1,2,3;

-- Aggregate-only evidence of partial preparation (no real account deletion/recovery).
DO $$ DECLARE summary jsonb; target uuid := nullif(current_setting('epocar.diagnostic_user_id',true),'')::uuid;
BEGIN
  IF to_regclass('public.account_deletion_log') IS NOT NULL THEN
    EXECUTE $q$
      SELECT jsonb_build_object(
        'prepared_without_terminal', count(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM public.account_deletion_log f WHERE f.target_user=p.target_user
            AND f.outcome IN ('deleted','already_deleted'))),
        'prepared_auth_still_exists', count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM auth.users u WHERE u.id=p.target_user)),
        'prepared_auth_missing_without_terminal', count(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM auth.users u WHERE u.id=p.target_user) AND NOT EXISTS (
          SELECT 1 FROM public.account_deletion_log f WHERE f.target_user=p.target_user
            AND f.outcome IN ('deleted','already_deleted'))))
      FROM public.account_deletion_log p WHERE outcome='prepared' AND ($1 IS NULL OR target_user=$1)
    $q$ INTO summary USING target;
    RAISE NOTICE 'deletion_audit %', summary;
  ELSE RAISE NOTICE 'account_deletion_log: not installed'; END IF;
  IF target IS NULL THEN
    RAISE NOTICE 'Set epocar.diagnostic_user_id to investigate one account; no identity is returned.';
    RETURN;
  END IF;
  SELECT jsonb_build_object('auth_exists', EXISTS(SELECT 1 FROM auth.users WHERE id=target),
    'roles', coalesce((SELECT jsonb_agg(role::text ORDER BY role::text) FROM public.user_roles WHERE user_id=target),'[]'::jsonb),
    'profile_exists', EXISTS(SELECT 1 FROM public.profiles WHERE user_id=target)) INTO summary;
  RAISE NOTICE 'target_account %', summary;
  IF to_regclass('public.membership_applications') IS NOT NULL THEN
    EXECUTE 'SELECT jsonb_agg(jsonb_build_object(''status'', status, ''treasury_linked'', treasury_member_id IS NOT NULL)) FROM public.membership_applications WHERE user_id=$1'
      INTO summary USING target;
    RAISE NOTICE 'target_applications %', coalesce(summary,'[]'::jsonb);
  END IF;
  IF to_regclass('public.member_public_status') IS NOT NULL THEN
    EXECUTE 'SELECT jsonb_agg(jsonb_build_object(''membership_status'',membership_status,''has_admission_date'',admission_date IS NOT NULL,''has_card'',card_number IS NOT NULL)) FROM public.member_public_status WHERE user_id=$1'
      INTO summary USING target;
    RAISE NOTICE 'target_projection %', coalesce(summary,'[]'::jsonb);
  END IF;
END $$;