ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS show_homepage_countdown boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_end_after_start') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_end_after_start CHECK (end_date IS NULL OR date IS NULL OR end_date >= date);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.events_single_homepage_countdown()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.show_homepage_countdown THEN
    UPDATE public.events SET show_homepage_countdown = false
    WHERE show_homepage_countdown AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS events_single_homepage_countdown ON public.events;
CREATE TRIGGER events_single_homepage_countdown BEFORE INSERT OR UPDATE OF show_homepage_countdown ON public.events
  FOR EACH ROW WHEN (NEW.show_homepage_countdown) EXECUTE FUNCTION public.events_single_homepage_countdown();
CREATE UNIQUE INDEX IF NOT EXISTS events_one_homepage_countdown ON public.events (show_homepage_countdown) WHERE show_homepage_countdown;
CREATE INDEX IF NOT EXISTS events_published_date_idx ON public.events (published, date);