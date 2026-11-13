-- Schema sintetico per i test del modulo Consiglio; mai eseguire su un database reale.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TYPE app_role AS ENUM ('admin','founder','president','vice_president','secretary','treasurer','councillor');
CREATE TABLE profiles(user_id uuid, first_name text, last_name text);
CREATE TABLE user_roles(user_id uuid, role app_role, UNIQUE(user_id,role));
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.role',true),'') $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb NOT NULL DEFAULT '{}', UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
GRANT USAGE ON SCHEMA auth, storage TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated, service_role;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
INSERT INTO profiles VALUES ('00000000-0000-4000-8000-000000000001','Anna','Presidente'),('00000000-0000-4000-8000-000000000002','Carlo','Segretario');
INSERT INTO user_roles VALUES ('00000000-0000-4000-8000-000000000001','president'),
  ('00000000-0000-4000-8000-000000000002','secretary'),
  ('00000000-0000-4000-8000-000000000003','councillor'),
  ('00000000-0000-4000-8000-000000000004','founder'),
  ('00000000-0000-4000-8000-000000000005','admin');
