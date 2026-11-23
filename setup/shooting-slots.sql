-- Apply after shooting-agenda-v33.sql on the external EPOCAR project.
begin;
alter table public.shooting_slots
  add column if not exists duration_minutes integer not null default 15
    check (duration_minutes between 1 and 240);

alter table public.shooting_requests drop constraint if exists shooting_requests_preferred_check;

create or replace function public.shooting_generate_slots(
  p_day date, p_start time, p_end time, p_count integer, p_minutes integer
) returns void language plpgsql security definer set search_path='' as $$
declare
  planned time[];
begin
  perform public.shooting_require_admin();
  if p_start is null or p_end is null or p_count is null or p_minutes is null
    or p_count not between 1 and 100 or p_minutes not between 1 and 240
    or extract(second from p_start) <> 0 or extract(second from p_end) <> 0
    or p_end <= p_start or p_end = time '24:00'
    or extract(epoch from (p_end - p_start)) < p_count::bigint * p_minutes * 60
  then raise exception 'invalid_slot_plan'; end if;

  -- Share the scheduling lock so bookings cannot be assigned during regeneration.
  perform pg_advisory_xact_lock(20261203,20261217);
  perform 1 from public.shooting_evenings where day=p_day and not cancelled for update;
  if not found then raise exception 'evening_unavailable'; end if;
  select array_agg(p_start + make_interval(mins => n * p_minutes) order by n)
  into planned from generate_series(0,p_count-1) n;

  if exists (
    select 1 from public.shooting_slots s join public.shooting_requests r on r.slot_id=s.id
    where s.day=p_day and (s.starts <> all(planned) or s.duration_minutes<>p_minutes)
  ) then raise exception 'occupied_slot_change'; end if;

  delete from public.shooting_slots where day=p_day and starts <> all(planned);
  insert into public.shooting_slots(day,starts,duration_minutes)
    select p_day, starts, p_minutes from unnest(planned) as t(starts)
    on conflict(day,starts) do update set duration_minutes=excluded.duration_minutes;
end $$;

revoke all on function public.shooting_generate_slots(date,time,time,integer,integer) from public,anon,authenticated;
grant execute on function public.shooting_generate_slots(date,time,time,integer,integer) to authenticated;

create or replace function public.submit_shooting_request(
  p_key uuid, p_day date, p_garage uuid, p_kind public.vehicle_type, p_brand text, p_model text,
  p_plate text, p_save boolean, p_preferred time, p_notes text, p_version text,
  p_read boolean, p_images boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  contact text;
  evening public.shooting_evenings;
  previous public.shooting_requests;
  vehicle public.vehicles;
  normalized text := upper(regexp_replace(trim(p_plate),'[ .-]','','g'));
  digest text := encode(sha256(convert_to(jsonb_build_array(p_day,p_garage,p_kind,p_brand,p_model,
    p_plate,p_save,p_preferred,p_notes,p_version,p_read,p_images)::text,'UTF8')),'hex');
  receipt uuid;
begin
  select email into contact from auth.users where id=owner_id and email_confirmed_at is not null;
  if nullif(contact,'') is null then raise exception 'verified_account_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into previous from public.shooting_requests where actor=owner_id and retry_key=p_key;
  if found then
    if previous.fingerprint <> digest then raise exception 'retry_conflict'; end if;
    return previous.id;
  end if;
  if (select count(*) from public.shooting_requests where actor=owner_id and created_at >= now()-interval '1 hour') >= 10
    then raise exception 'too_many_requests'; end if;
  select * into evening from public.shooting_evenings where day=p_day for share;
  if not found or not evening.accepting or (current_timestamp at time zone 'Europe/Rome') >= p_day + coalesce((select min(starts) from public.shooting_slots where day=p_day and capacity>0), time '18:30')
    then raise exception 'collection_closed'; end if;
  if p_version is distinct from evening.policy_version or p_read is not true or p_images is null
    then raise exception 'policy_required'; end if;
  if p_garage is not null then
    select * into vehicle from public.vehicles where id=p_garage and user_id=owner_id for share;
    if not found then raise exception 'vehicle_unavailable'; end if;
    p_brand := vehicle.brand; p_model := vehicle.model; p_kind := vehicle.type;
  elsif p_save then
    select id into p_garage from public.vehicles where user_id=owner_id
      and upper(regexp_replace(plate,'[ .-]','','g'))=normalized order by id limit 1;
    if not found then
      insert into public.vehicles(user_id,type,brand,model,plate)
        values(owner_id,p_kind,trim(p_brand),trim(p_model),normalized) returning id into p_garage;
    end if;
  end if;
  insert into public.shooting_requests(actor,retry_key,fingerprint,day,garage_id,kind,brand,model,plate,
    preferred,notes,email,policy_version,privacy_text,image_text,image_permission)
  values(owner_id,p_key,digest,p_day,p_garage,p_kind,trim(p_brand),trim(p_model),normalized,
    p_preferred,trim(coalesce(p_notes,'')),contact,evening.policy_version,evening.privacy_text,evening.image_text,p_images)
  returning id into receipt;
  insert into public.shooting_receipt_queue(request_id) values(receipt);
  return receipt;
end $$;
commit;
