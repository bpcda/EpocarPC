-- External EPOCAR project, after shooting-slots.sql.
begin;
create table if not exists public.shooting_calendar_events (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place text not null,
  revision bigint not null default 1,
  applied_revision bigint not null default 0,
  lease uuid,
  lease_until timestamptz,
  last_error text,
  calendar_id text,
  remote_id uuid not null default gen_random_uuid()
);
alter table public.shooting_calendar_events enable row level security;
revoke all on public.shooting_calendar_events from public, anon, authenticated;
grant select, update on public.shooting_calendar_events to service_role;

create or replace function public.shooting_track_calendar()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  previous_slot uuid;
  next_slot uuid;
  reusable uuid;
begin
  if tg_op <> 'INSERT' and old.state = 'confirmed' then previous_slot := old.slot_id; end if;
  if tg_op <> 'DELETE' and new.state = 'confirmed' then next_slot := new.slot_id; end if;
  if previous_slot is not distinct from next_slot then return null; end if;
  perform pg_advisory_xact_lock(20261203,20261217);

  -- Move the existing event when its last vehicle moves to an empty slot.
  if previous_slot is not null and not exists (
    select 1 from public.shooting_requests where slot_id=previous_slot and state='confirmed'
  ) then
    update public.shooting_calendar_events set slot_id=null, revision=revision+1, last_error=null
      where slot_id=previous_slot returning id into reusable;
  end if;
  if next_slot is not null and not exists (
    select 1 from public.shooting_calendar_events where slot_id=next_slot
  ) then
    insert into public.shooting_calendar_events(id, slot_id, starts_at, ends_at, place)
      select coalesce(reusable,gen_random_uuid()), s.id, (s.day+s.starts) at time zone 'Europe/Rome',
        (s.day+s.starts+make_interval(mins=>s.duration_minutes)) at time zone 'Europe/Rome', e.meeting_place
      from public.shooting_slots s join public.shooting_evenings e on e.day=s.day where s.id=next_slot
      on conflict(id) do update set slot_id=excluded.slot_id,starts_at=excluded.starts_at,
        ends_at=excluded.ends_at,place=excluded.place;
  end if;
  return null;
end $$;
drop trigger if exists shooting_calendar_change on public.shooting_requests;
create trigger shooting_calendar_change after insert or update of slot_id,state or delete on public.shooting_requests
  for each row execute function public.shooting_track_calendar();
insert into public.shooting_calendar_events(slot_id,starts_at,ends_at,place)
  select s.id, (s.day+s.starts) at time zone 'Europe/Rome',
    (s.day+s.starts+make_interval(mins=>s.duration_minutes)) at time zone 'Europe/Rome', e.meeting_place
  from public.shooting_slots s join public.shooting_evenings e on e.day=s.day
  where exists(select 1 from public.shooting_requests r where r.slot_id=s.id and r.state='confirmed')
  on conflict(slot_id) do nothing;

create or replace function public.shooting_calendar_status()
returns integer language plpgsql stable security definer set search_path='' as $$
begin
  perform public.shooting_require_admin();
  return (select count(*) from public.shooting_calendar_events where applied_revision<revision);
end $$;

create or replace function public.shooting_calendar_claim(p_calendar text)
returns setof public.shooting_calendar_events language sql security definer set search_path='' as $$
  with batch as (
    select id from public.shooting_calendar_events
    where applied_revision<revision and (lease_until is null or lease_until<now())
    order by last_error nulls first, starts_at, id limit 6 for update skip locked
  )
  update public.shooting_calendar_events e set lease=gen_random_uuid(), lease_until=now()+interval '2 minutes',
    calendar_id=coalesce(e.calendar_id,p_calendar)
  from batch where e.id=batch.id returning e.*;
$$;

revoke all on function public.shooting_track_calendar(),public.shooting_calendar_status(),public.shooting_calendar_claim(text) from public,anon,authenticated;
grant execute on function public.shooting_calendar_status() to authenticated;
grant execute on function public.shooting_calendar_claim(text) to service_role;
commit;
