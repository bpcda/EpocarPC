-- EPOCAR: DIAGNOSI SOLA LETTURA, SQL Editor del progetto ESTERNO.
-- Nessuna RPC applicativa viene eseguita. Nessuna modifica a dati/schema/storage.
-- Sostituire EMAIL_ACCOUNT_A e EMAIL_ACCOUNT_B in ENTRAMBI i blocchi 1 e 3.
-- A = account con foto/contenuti da conservare; B = account ora collegato alla Tesoreria.
-- Eseguire i blocchi separatamente. Il blocco 3 GENERA un SELECT: copiarlo ed eseguirlo
-- come blocco 4. Tabelle opzionali assenti sono elencate dal blocco 2, non ignorate.

-- 1. UUID Auth: esattamente una corrispondenza per email e due UUID distinti.
WITH params(account, email) AS (VALUES
  ('A', 'EMAIL_ACCOUNT_A'::text), ('B', 'EMAIL_ACCOUNT_B'::text)
)
SELECT p.account, p.email AS requested_email, count(u.id) OVER (PARTITION BY p.account) AS matches,
       u.id AS auth_user_id, u.email, u.created_at, u.email_confirmed_at,
       u.last_sign_in_at
FROM params p LEFT JOIN auth.users u ON lower(u.email) = lower(trim(p.email))
ORDER BY p.account, u.id;

-- 2a. Schema effettivamente installato: una tabella assente NON significa zero collegamenti.
WITH expected(table_schema, table_name) AS (VALUES
 ('public','profiles'), ('public','user_roles'), ('public','membership_applications'),
 ('public','member_public_status'), ('public','treasury_bootstrap_links'),
 ('public','member_annual_fees'), ('public','treasury_member_events'),
 ('public','treasury_sync_requests'), ('public','association_members'),
 ('public','association_member_events'), ('public','association_people_order'),
 ('public','association_founders'), ('public','association_documents'),
 ('public','articles'), ('public','events'), ('public','gallery_images'),
 ('public','vehicles'), ('public','event_registrations'), ('public','role_audit_log'),
 ('public','account_deletion_log'), ('storage','objects'), ('storage','buckets')
)
SELECT e.*, to_regclass(format('%I.%I',e.table_schema,e.table_name)) IS NOT NULL AS installed,
       c.column_name, c.data_type
FROM expected e LEFT JOIN information_schema.columns c
  ON c.table_schema=e.table_schema AND c.table_name=e.table_name
ORDER BY e.table_schema,e.table_name,c.ordinal_position;

-- 2b. Vincoli/FK che coinvolgono gli identificatori da preservare (incluse dipendenze inverse).
SELECT n.nspname AS table_schema,c.relname AS table_name,k.conname,k.contype,
       pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE k.conrelid IN (SELECT x.oid FROM pg_class x JOIN pg_namespace z ON z.oid=x.relnamespace
  WHERE (z.nspname='auth' AND x.relname='users') OR (z.nspname='public' AND x.relname IN
  ('profiles','membership_applications','member_public_status','treasury_bootstrap_links','association_members','member_annual_fees')))
 OR k.confrelid IN (SELECT x.oid FROM pg_class x JOIN pg_namespace z ON z.oid=x.relnamespace
  WHERE (z.nspname='auth' AND x.relname='users') OR (z.nspname='public' AND x.relname IN
  ('membership_applications','member_public_status','association_members')))
ORDER BY 1,2,3;

-- 2c. Inventario delle funzioni/trigger, SENZA chiamarle né esportarne il corpo.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS signature,
       p.proargnames,p.prosecdef,p.provolatile,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE 'treasury_sync_%' OR p.proname IN
 ('member_update_v2','member_public_upsert','association_members_link_account','association_members_sync_role'))
ORDER BY p.proname,signature;
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN
 ('association_members','membership_applications','member_public_status','treasury_bootstrap_links','user_roles')
ORDER BY 1,2,3;

-- 3. Generatore di SELECT compatibile con le diverse migrazioni installate.
-- Solo colonne in whitelist: MAI righe Auth complete, metadata Auth, password, token,
-- hash, risposte/payload sync, answers, note interne, HTML integrale o URL firmati.
WITH params AS (SELECT 'EMAIL_ACCOUNT_A'::text AS email_a,'EMAIL_ACCOUNT_B'::text AS email_b),
spec(table_name,fields,scope) AS (VALUES
 ('profiles',ARRAY['id','user_id','first_name','last_name','city','phone','avatar_url','created_at','updated_at'],'user'),
 ('user_roles',ARRAY['id','user_id','role'],'user'),
 ('membership_applications',ARRAY['id','user_id','full_name','email','status','requested_category','member_id','treasury_member_id','file_path','filename','statute_path','form_path','created_at','submitted_at','reviewed_at','approved_at','rejected_at','cancelled_at','decided_at','decided_by','resolution_ref','resolution_date','updated_at'],'application'),
 ('member_public_status',ARRAY['user_id','treasury_member_id','application_id','category','membership_status','card_number','admission_date','admission_status','admission_source','admission_reference','admission_decision_date','membership_year','fee_status','last_revision','treasury_updated_at','updated_at'],'member'),
 ('treasury_bootstrap_links',ARRAY['external_member_id','treasury_member_id','acknowledged_at','request_id'],'member'),
 ('association_members',ARRAY['id','user_id','full_name','email','category','active','card_number','member_number','admission_date','ceased_on','resolution_ref','resolution_date','created_at','updated_at'],'register'),
 ('association_member_events',ARRAY['id','member_id','application_id','event_type','category','card_number','resolution_ref','resolution_date','created_by','created_at'],'history'),
 ('member_annual_fees',ARRAY['treasury_member_id','membership_year','fee_status','fee_amount','fee_paid_amount','fee_balance','last_payment_date','last_payment_amount','last_payment_receipt_number','updated_at'],'tm'),
 ('treasury_member_events',ARRAY['event_id','treasury_member_id','revision','result','applied_at'],'tm'),
 ('treasury_sync_requests',ARRAY['action','application_id','treasury_member_id','request_id','created_at'],'request'),
 ('association_people_order',ARRAY['user_id','sort_order','updated_at'],'user'),
 ('articles',ARRAY['id','title','published','uploaded_by','image_url','created_at','updated_at'],'content'),
 ('events',ARRAY['id','title','published','uploaded_by','image_url','date','end_date','created_at','updated_at'],'content'),
 ('gallery_images',ARRAY['id','uploaded_by','image_url','alt_text','sort_order','created_at'],'content'),
 ('vehicles',ARRAY['id','user_id','type','brand','model','year','plate','photo_url','created_at','updated_at'],'user'),
 ('event_registrations',ARRAY['id','event_id','user_id','vehicle_id','created_at','updated_at'],'registration'),
 ('role_audit_log',ARRAY['id','changed_by','target_user','role','previous_state','new_state','action','created_at'],'roleaudit'),
 ('account_deletion_log',ARRAY['id','actor','target_user','mode','outcome','created_at'],'deletion')
), installed AS (
 SELECT s.*, (SELECT string_agg(format('%L, %s',c.column_name,
   CASE WHEN c.column_name IN ('avatar_url','image_url','photo_url')
    THEN format('to_jsonb(split_part(split_part(r.%I,''?'',1),''#'',1))',c.column_name)
    ELSE format('to_jsonb(r.%I)',c.column_name) END),', ' ORDER BY c.ordinal_position)
  FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=s.table_name
    AND c.column_name=ANY(s.fields)) AS projection
 FROM spec s WHERE to_regclass(format('public.%I',s.table_name)) IS NOT NULL
), seed_parts AS (
 SELECT format('SELECT to_jsonb(x)->>''treasury_member_id'' AS tm FROM public.%I x WHERE
  to_jsonb(x)->>''user_id'' IN (SELECT id::text FROM ids) OR to_jsonb(x)->>''external_member_id'' IN (SELECT id::text FROM ids)',table_name) AS q
 FROM installed WHERE table_name IN ('membership_applications','member_public_status','treasury_bootstrap_links')
), app_part AS (
 SELECT CASE WHEN to_regclass('public.membership_applications') IS NULL THEN 'SELECT NULL::text AS id WHERE false'
 ELSE 'SELECT to_jsonb(x)->>''id'' AS id FROM public.membership_applications x WHERE to_jsonb(x)->>''user_id'' IN (SELECT id::text FROM ids) OR lower(to_jsonb(x)->>''email'') IN (SELECT lower(trim(email)) FROM params)' END AS q
), register_part AS (
 SELECT CASE WHEN to_regclass('public.association_members') IS NULL THEN 'SELECT NULL::text AS id WHERE false'
 ELSE 'SELECT to_jsonb(x)->>''id'' AS id FROM public.association_members x WHERE to_jsonb(x)->>''user_id'' IN (SELECT id::text FROM ids) OR lower(to_jsonb(x)->>''email'') IN (SELECT lower(trim(email)) FROM params)' END AS q
), parts AS (
 SELECT format('SELECT %L AS section, jsonb_build_object(%s) AS data FROM public.%I r WHERE %s',
  table_name,projection,table_name,CASE scope
  WHEN 'user' THEN 'to_jsonb(r)->>''user_id'' IN (SELECT id::text FROM ids)'
  WHEN 'application' THEN 'to_jsonb(r)->>''id'' IN (SELECT id FROM apps) OR to_jsonb(r)->>''treasury_member_id'' IN (SELECT tm FROM tms)'
  WHEN 'member' THEN 'to_jsonb(r)->>''user_id'' IN (SELECT id::text FROM ids) OR to_jsonb(r)->>''external_member_id'' IN (SELECT id::text FROM ids) OR to_jsonb(r)->>''treasury_member_id'' IN (SELECT tm FROM tms)'
  WHEN 'register' THEN 'to_jsonb(r)->>''id'' IN (SELECT id FROM registers)'
  WHEN 'tm' THEN 'to_jsonb(r)->>''treasury_member_id'' IN (SELECT tm FROM tms)'
  WHEN 'request' THEN 'to_jsonb(r)->>''treasury_member_id'' IN (SELECT tm FROM tms) OR to_jsonb(r)->>''application_id'' IN (SELECT id FROM apps) OR to_jsonb(r)->''response''->>''external_member_id'' IN (SELECT id::text FROM ids)'
  WHEN 'history' THEN 'to_jsonb(r)->>''application_id'' IN (SELECT id FROM apps) OR to_jsonb(r)->>''member_id'' IN (SELECT id FROM registers)'
  WHEN 'content' THEN 'to_jsonb(r)->>''uploaded_by'' IN (SELECT id::text FROM ids) OR EXISTS (SELECT 1 FROM ids i WHERE strpos(coalesce(to_jsonb(r)->>''image_url'',''''),i.id::text || ''/'')>0)'
  WHEN 'registration' THEN 'to_jsonb(r)->>''user_id'' IN (SELECT id::text FROM ids)'
  WHEN 'roleaudit' THEN 'to_jsonb(r)->>''target_user'' IN (SELECT id::text FROM ids) OR to_jsonb(r)->>''changed_by'' IN (SELECT id::text FROM ids)'
  WHEN 'deletion' THEN 'to_jsonb(r)->>''target_user'' IN (SELECT id::text FROM ids)'
  END) AS q FROM installed WHERE projection IS NOT NULL
)
SELECT format('WITH params(account,email) AS (VALUES (''A'',%L::text),(''B'',%L::text)),
 ids AS (SELECT p.account,u.id FROM params p JOIN auth.users u ON lower(u.email)=lower(trim(p.email))),
 apps AS (%s), registers AS (%s), tms AS (%s)
 %s ORDER BY section,data::text;',p.email_a,p.email_b,a.q,r.q,
 coalesce((SELECT string_agg(q,' UNION ALL ') FROM seed_parts),'SELECT NULL::text AS tm WHERE false'),
 (SELECT string_agg(q,E'\nUNION ALL\n' ORDER BY q) FROM parts)) AS readonly_sql_to_copy_and_run
FROM params p CROSS JOIN app_part a CROSS JOIN register_part r;

-- 4. Eseguire il SELECT generato dal blocco 3 (non questo commento).

-- 5. Storage: sostituire i DUE UUID ottenuti dal blocco 1.
-- owner/owner_id possono dipendere dalla versione Storage: estrazione JSON compatibile.
-- Nome/percorso != proprietà: tutte le prove sono riportate separatamente.
WITH ids(account,id) AS (VALUES ('A','UUID_AUTH_A'::uuid),('B','UUID_AUTH_B'::uuid))
SELECT i.account,o.id AS object_id,o.bucket_id,o.name,o.created_at,o.updated_at,
       to_jsonb(o)->>'owner' AS owner, to_jsonb(o)->>'owner_id' AS owner_id,
       to_jsonb(o)->>'owner'=i.id::text AS matches_owner,
       to_jsonb(o)->>'owner_id'=i.id::text AS matches_owner_id,
       split_part(o.name,'/',1)=i.id::text AS matches_first_folder,
       strpos(o.name,i.id::text)>0 AS uuid_anywhere_in_name,
       b.public AS bucket_public
FROM storage.objects o JOIN ids i ON to_jsonb(o)->>'owner'=i.id::text
 OR to_jsonb(o)->>'owner_id'=i.id::text OR strpos(o.name,i.id::text)>0
LEFT JOIN storage.buckets b ON b.id=o.bucket_id
ORDER BY i.account,o.bucket_id,o.name;

-- 6. Immagini pubbliche e riuso in contenuti di ALTRI autori.
-- Copiare UUID e un bucket/percorso dalla query 5, oppure da image_url/profilo del blocco 4.
-- Ripetere per le immagini importanti; per avatar/veicoli usare anche i risultati del blocco 4.
-- Non genera URL né token; ritorna solo ID, titolo, autore e presenza del riferimento.
WITH asset AS (SELECT 'BUCKET_DA_VERIFICARE'::text AS bucket,'PERCORSO_OGGETTO'::text AS path),
refs AS (
 SELECT 'articles'::text AS source,id,title,uploaded_by,
   image_url,coalesce(content,'') AS body FROM public.articles
 UNION ALL SELECT 'events',id,title,uploaded_by,image_url,coalesce(description,'') FROM public.events
 UNION ALL SELECT 'gallery_images',id,alt_text,uploaded_by,image_url,'' FROM public.gallery_images
)
SELECT r.source,r.id,r.title,r.uploaded_by,
       strpos(coalesce(r.image_url,''),a.bucket || '/' || a.path)>0 AS image_reference,
       strpos(r.body,a.bucket || '/' || a.path)>0 AS embedded_reference
FROM refs r CROSS JOIN asset a
WHERE strpos(coalesce(r.image_url,''),a.bucket || '/' || a.path)>0
 OR strpos(r.body,a.bucket || '/' || a.path)>0
ORDER BY r.source,r.id;

-- Nessun SELECT * da auth.users/auth.identities. Non eseguire funzioni sync/import/delete.
-- Se una query fallisce per schema/versione, riportare solo errore e inventario 2a: non
-- installare migrazioni, non disattivare RLS e non tentare una cancellazione per diagnosticare.