-- Epocar external database only. No existing content or creation dates are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_article_publication_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.published IS TRUE AND NEW.published_at IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.published IS TRUE AND (OLD.published_at IS NULL OR OLD.published_at <= now()) THEN
      NEW.published_at := COALESCE(OLD.published_at, OLD.created_at);
    ELSE
      NEW.published_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_article_publication_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_article_publication_time ON public.articles;
CREATE TRIGGER set_article_publication_time
BEFORE INSERT OR UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_article_publication_time();

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
-- A restrictive gate also protects against other permissive SELECT policies.
-- Admin/staff retain their existing editorial access; no write privileges change.
DROP POLICY IF EXISTS article_publication_gate ON public.articles;
CREATE POLICY article_publication_gate ON public.articles
AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  (published IS TRUE AND (published_at IS NULL OR published_at <= now()))
  OR public.has_role((SELECT auth.uid()), 'admin')
  OR public.has_role((SELECT auth.uid()), 'staff')
);

NOTIFY pgrst, 'reload schema';
COMMIT;
