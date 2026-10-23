-- Review and install MANUALLY on the external project. No real event/account is seeded.
BEGIN;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS booking_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.event_booking_settings_validate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s jsonb := NEW.booking_settings; k text; n integer;
BEGIN
 IF jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'Invalid booking settings'; END IF;
 FOREACH k IN ARRAY ARRAY['enabled','drive_enabled','exhibition_enabled'] LOOP
  IF s ? k AND jsonb_typeof(s->k) <> 'boolean' THEN RAISE EXCEPTION 'Invalid boolean setting: %',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['max_people','max_vehicles','people_per_booking','vehicles_per_booking'] LOOP
  IF s ? k AND s->k <> 'null'::jsonb THEN
   IF jsonb_typeof(s->k) <> 'number' OR (s->>k) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid limit: %',k; END IF;
   n := (s->>k)::integer;
   IF n < 1 OR n > CASE WHEN k IN ('people_per_booking','vehicles_per_booking') THEN 100 ELSE 100000 END THEN RAISE EXCEPTION 'Invalid limit: %',k; END IF;
  END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['programme','price_without','price_with','privacy_text','privacy_version','account_terms','account_terms_version'] LOOP
  IF s ? k AND (jsonb_typeof(s->k) <> 'string' OR length(s->>k)>12000) THEN RAISE EXCEPTION 'Invalid text setting: %',k; END IF;
 END LOOP;
 IF coalesce((s->>'enabled')::boolean,false) AND (coalesce(s->>'privacy_text','')='' OR coalesce(s->>'privacy_version','')='') THEN RAISE EXCEPTION 'Privacy text/version required'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.event_booking_settings_validate() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS event_booking_settings_validate ON public.events;
CREATE TRIGGER event_booking_settings_validate BEFORE INSERT OR UPDATE OF booking_settings ON public.events FOR EACH ROW EXECUTE FUNCTION public.event_booking_settings_validate();

CREATE TABLE IF NOT EXISTS public.event_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE DEFAULT ('EPC-'||upper(replace(gen_random_uuid()::text,'-',''))),
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
 user_id uuid, mode text NOT NULL CHECK(mode IN ('without_vehicle','with_vehicle')),
 first_name text NOT NULL, last_name text NOT NULL, email text NOT NULL, phone text NOT NULL,
 participants integer NOT NULL CHECK(participants BETWEEN 1 AND 100), drive boolean NOT NULL, exhibition boolean NOT NULL,
 vehicles jsonb NOT NULL CHECK(jsonb_typeof(vehicles)='array'),
 privacy_accepted_at timestamptz NOT NULL DEFAULT now(), privacy_version text NOT NULL, privacy_text text NOT NULL,
 account_requested boolean NOT NULL DEFAULT false, account_terms_accepted_at timestamptz, account_terms_version text, account_terms text,
 email_status text NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending','sent','failed')),
 activation_status text NOT NULL DEFAULT 'not_requested' CHECK(activation_status IN ('not_requested','pending','sent','failed')),
 garage_saved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_bookings TO authenticated;
GRANT ALL ON public.event_bookings TO service_role;
REVOKE ALL ON public.event_bookings FROM anon;
ALTER TABLE public.event_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_bookings_read ON public.event_bookings;
CREATE POLICY event_bookings_read ON public.event_bookings FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE INDEX IF NOT EXISTS event_bookings_event ON public.event_bookings(event_id,created_at,id);

CREATE TABLE IF NOT EXISTS public.event_booking_requests (
 event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT, idempotency_key uuid NOT NULL,
 booking_id uuid NOT NULL REFERENCES public.event_bookings(id) ON DELETE RESTRICT,
 payload jsonb NOT NULL, actor uuid, PRIMARY KEY(event_id,idempotency_key)
);
GRANT ALL ON public.event_booking_requests TO service_role;
REVOKE ALL ON public.event_booking_requests FROM anon,authenticated;
ALTER TABLE public.event_booking_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.event_booking_create(_booking jsonb,_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events; s jsonb; b public.event_bookings; req public.event_booking_requests; v jsonb; k text;
 eid uuid; ik uuid; people integer; nv integer; used_people bigint; used_vehicles bigint; plates text[] := '{}'; plate_key text;
BEGIN
 IF jsonb_typeof(_booking)<>'object' THEN RAISE EXCEPTION 'Invalid booking'; END IF;
 eid:=(_booking->>'event_id')::uuid; ik:=(_booking->>'idempotency_key')::uuid;
 IF eid IS NULL OR ik IS NULL THEN RAISE EXCEPTION 'Missing identifiers'; END IF;
 SELECT * INTO e FROM public.events WHERE id=eid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event unavailable'; END IF;
 SELECT * INTO req FROM public.event_booking_requests WHERE event_id=eid AND idempotency_key=ik;
 IF FOUND THEN
  IF req.payload IS DISTINCT FROM _booking OR req.actor IS DISTINCT FROM _user_id THEN RAISE EXCEPTION 'Retry conflict'; END IF;
  SELECT * INTO b FROM public.event_bookings WHERE id=req.booking_id;
  RETURN jsonb_build_object('ok',true,'id',b.id,'reference',b.reference,'email_status',b.email_status,'account_requested',b.account_requested,'activation_status',b.activation_status,'replayed',true);
 END IF;
 s:=e.booking_settings;
 IF NOT coalesce(e.published,false) OR NOT e.registration_enabled OR NOT coalesce((s->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'Bookings closed'; END IF;
 IF _user_id IS NULL AND NOT e.allow_guests THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=_user_id) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 FOREACH k IN ARRAY ARRAY['first_name','last_name','email','phone','privacy_version','account_terms_version','mode'] LOOP
  IF jsonb_typeof(_booking->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid field: %',k; END IF;
 END LOOP;
 IF length(trim(_booking->>'first_name')) NOT BETWEEN 1 AND 100 OR length(trim(_booking->>'last_name')) NOT BETWEEN 1 AND 100
 OR length(_booking->>'email')>254 OR (_booking->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR length(_booking->>'phone') NOT BETWEEN 6 AND 30 OR (_booking->>'phone') !~ '^[+0-9 ().-]+$' THEN RAISE EXCEPTION 'Invalid contact details'; END IF;
 FOREACH k IN ARRAY ARRAY['drive','exhibition','account_requested','account_terms_accepted','privacy_accepted'] LOOP
  IF jsonb_typeof(_booking->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid boolean: %',k; END IF;
 END LOOP;
 IF _booking->'privacy_accepted'<>'true'::jsonb OR _booking->>'privacy_version' IS DISTINCT FROM s->>'privacy_version' OR coalesce(s->>'privacy_text','')='' THEN RAISE EXCEPTION 'Privacy acceptance outdated'; END IF;
 IF jsonb_typeof(_booking->'participants') IS DISTINCT FROM 'number' OR (_booking->>'participants') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid participant count'; END IF;
 people:=(_booking->>'participants')::integer;
 IF people<1 OR people>coalesce((s->>'people_per_booking')::integer,10) THEN RAISE EXCEPTION 'Participant limit exceeded'; END IF;
 IF jsonb_typeof(_booking->'vehicles') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid vehicles'; END IF;
 nv:=jsonb_array_length(_booking->'vehicles');
 IF _booking->>'mode' NOT IN ('without_vehicle','with_vehicle') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 IF _booking->>'mode'='without_vehicle' AND (nv>0 OR (_booking->>'drive')::boolean OR (_booking->>'exhibition')::boolean OR (_booking->>'account_requested')::boolean) THEN RAISE EXCEPTION 'Invalid vehicle-free booking'; END IF;
 IF _booking->>'mode'='with_vehicle' AND (nv<1 OR nv>coalesce((s->>'vehicles_per_booking')::integer,10)) THEN RAISE EXCEPTION 'Vehicle limit exceeded'; END IF;
 IF (_booking->>'drive')::boolean AND NOT coalesce((s->>'drive_enabled')::boolean,true) OR (_booking->>'exhibition')::boolean AND NOT coalesce((s->>'exhibition_enabled')::boolean,true) THEN RAISE EXCEPTION 'Activity unavailable'; END IF;
 IF (_booking->>'account_requested')::boolean AND (NOT (_booking->>'account_terms_accepted')::boolean OR coalesce(s->>'account_terms','')='' OR coalesce(s->>'account_terms_version','')='' OR _booking->>'account_terms_version' IS DISTINCT FROM s->>'account_terms_version') THEN RAISE EXCEPTION 'Account terms acceptance required'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(_booking->'vehicles') LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR coalesce(v->>'type','') NOT IN ('auto','moto','vespa') THEN RAISE EXCEPTION 'Invalid vehicle type'; END IF;
  FOREACH k IN ARRAY ARRAY['brand','model','plate'] LOOP
   IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR length(trim(v->>k)) NOT BETWEEN 1 AND CASE WHEN k='plate' THEN 20 ELSE 100 END THEN RAISE EXCEPTION 'Invalid vehicle: %',k; END IF;
  END LOOP;
  IF jsonb_typeof(v->'year') IS DISTINCT FROM 'number' OR (v->>'year') !~ '^[0-9]+$' OR (v->>'year')::integer NOT BETWEEN 1886 AND 2100 OR (v->>'plate') !~ '^[A-Za-z0-9 .-]+$' THEN RAISE EXCEPTION 'Invalid vehicle year/plate'; END IF;
  plate_key:=upper(regexp_replace(v->>'plate','[ .-]','','g'));
  IF plate_key=ANY(plates) THEN RAISE EXCEPTION 'Duplicate vehicle'; END IF; plates:=array_append(plates,plate_key);
  IF v->>'garage_id' IS NOT NULL AND (_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.vehicles WHERE id=(v->>'garage_id')::uuid AND user_id=_user_id)) THEN RAISE EXCEPTION 'Garage vehicle not owned'; END IF;
 END LOOP;
 SELECT coalesce(sum(participants),0),coalesce(sum(jsonb_array_length(vehicles)),0) INTO used_people,used_vehicles FROM public.event_bookings WHERE event_id=eid;
 IF s->>'max_people' IS NOT NULL AND used_people+people>(s->>'max_people')::integer THEN RAISE EXCEPTION 'Participant capacity reached'; END IF;
 IF s->>'max_vehicles' IS NOT NULL AND used_vehicles+nv>(s->>'max_vehicles')::integer THEN RAISE EXCEPTION 'Vehicle capacity reached'; END IF;
 INSERT INTO public.event_bookings(event_id,user_id,mode,first_name,last_name,email,phone,participants,drive,exhibition,vehicles,privacy_version,privacy_text,account_requested,account_terms_accepted_at,account_terms_version,account_terms,activation_status)
 VALUES(eid,_user_id,_booking->>'mode',trim(_booking->>'first_name'),trim(_booking->>'last_name'),lower(trim(_booking->>'email')),_booking->>'phone',people,(_booking->>'drive')::boolean,(_booking->>'exhibition')::boolean,_booking->'vehicles',s->>'privacy_version',s->>'privacy_text',(_booking->>'account_requested')::boolean,CASE WHEN (_booking->>'account_requested')::boolean THEN now() END,CASE WHEN (_booking->>'account_requested')::boolean THEN s->>'account_terms_version' END,CASE WHEN (_booking->>'account_requested')::boolean THEN s->>'account_terms' END,CASE WHEN (_booking->>'account_requested')::boolean AND _user_id IS NULL THEN 'pending' ELSE 'not_requested' END) RETURNING * INTO b;
 INSERT INTO public.event_booking_requests VALUES(eid,ik,b.id,_booking,_user_id);
 RETURN jsonb_build_object('ok',true,'id',b.id,'reference',b.reference,'email_status',b.email_status,'account_requested',b.account_requested,'activation_status',b.activation_status,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.event_booking_create(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_booking_create(jsonb,uuid) TO service_role;

-- Guest claims require an authenticated OTP session, attested by the edge function.
CREATE OR REPLACE FUNCTION public.event_booking_claim(_booking_id uuid,_user_id uuid,_email text,_otp_verified boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.event_bookings; v jsonb; n integer:=0;
BEGIN
 PERFORM 1 FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 SELECT * INTO b FROM public.event_bookings WHERE id=_booking_id FOR UPDATE;
 IF NOT FOUND OR NOT b.account_requested THEN RAISE EXCEPTION 'Booking unavailable'; END IF;
 IF b.user_id IS NOT NULL AND b.user_id<>_user_id THEN RAISE EXCEPTION 'Booking not owned'; END IF;
 IF b.user_id IS NULL AND (NOT coalesce(_otp_verified,false) OR lower(b.email) IS DISTINCT FROM lower(_email)) THEN RAISE EXCEPTION 'Verified activation required'; END IF;
 IF b.garage_saved_at IS NOT NULL THEN RETURN 0; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(b.vehicles) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.vehicles WHERE user_id=_user_id AND upper(regexp_replace(coalesce(plate,''),'[ .-]','','g'))=upper(regexp_replace(v->>'plate','[ .-]','','g'))) THEN
   INSERT INTO public.vehicles(user_id,type,brand,model,year,plate) VALUES(_user_id,(v->>'type')::public.vehicle_type,v->>'brand',v->>'model',(v->>'year')::integer,upper(v->>'plate')); n:=n+1;
  END IF;
 END LOOP;
 UPDATE public.event_bookings SET user_id=_user_id,garage_saved_at=now() WHERE id=b.id;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.event_booking_claim(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_booking_claim(uuid,uuid,text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
