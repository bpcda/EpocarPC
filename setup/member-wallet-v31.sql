-- External Epocar instance, after member-cards-v30.sql. Wallet delivery never changes a QR or membership.
BEGIN;
ALTER TABLE public.member_card_credentials
  ADD COLUMN IF NOT EXISTS apple_wallet_path text,
  ADD COLUMN IF NOT EXISTS google_wallet_url text,
  ADD COLUMN IF NOT EXISTS wallet_updated_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.member_card_credentials'::regclass AND conname='member_wallet_apple_path') THEN
    ALTER TABLE public.member_card_credentials ADD CONSTRAINT member_wallet_apple_path CHECK (
      apple_wallet_path IS NULL OR apple_wallet_path ~ ('^' || treasury_member_id::text || '/[0-9a-f-]{36}\.pkpass$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.member_card_credentials'::regclass AND conname='member_wallet_google_url') THEN
    ALTER TABLE public.member_card_credentials ADD CONSTRAINT member_wallet_google_url CHECK (
      google_wallet_url IS NULL OR (length(google_wallet_url) <= 12000 AND google_wallet_url ~ '^https://pay\.google\.com/gp/v/save/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'));
  END IF;
END $$;
GRANT UPDATE (apple_wallet_path, google_wallet_url, wallet_updated_at) ON public.member_card_credentials TO service_role;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('member-wallet-passes','member-wallet-passes',false,5242880,ARRAY['application/vnd.apple.pkpass'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=ARRAY['application/vnd.apple.pkpass'];
-- An existing permissive Storage policy must not expose passes or allow browser uploads.
DROP POLICY IF EXISTS member_wallet_server_only ON storage.objects;
CREATE POLICY member_wallet_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (bucket_id <> 'member-wallet-passes') WITH CHECK (bucket_id <> 'member-wallet-passes');
NOTIFY pgrst, 'reload schema';
COMMIT;
