-- Requires v32. Run on the external Epocar project in a transaction.
begin;
alter table public.shooting_evenings add column if not exists cancelled boolean not null default false;
alter table public.shooting_evenings add column if not exists meeting_place text not null default '';
alter table public.shooting_evenings drop constraint if exists shooting_evening_open;
alter table public.shooting_evenings add constraint shooting_evening_open check (not accepting or (not cancelled and trim(meeting_place) <> ''));
create table if not exists public.shooting_slots (
 id uuid primary key default gen_random_uuid(), day date not null references public.shooting_evenings,
 starts time not null, capacity integer not null default 1 check(capacity between 0 and 20),
 unique(day, starts)
);
insert into public.shooting_slots(day,starts)
select day, time '18:30' + n*interval '15 minutes' from public.shooting_evenings cross join generate_series(0,4) n
on conflict(day,starts) do nothing;
alter table public.shooting_requests add column if not exists slot_id uuid references public.shooting_slots;
alter table public.shooting_requests add column if not exists revision integer not null default 0;
alter table public.shooting_requests add column if not exists appointment text;
alter table public.shooting_requests add column if not exists assigned_day date;
grant select(appointment) on public.shooting_requests to authenticated;
create table if not exists public.shooting_messages (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.shooting_requests on delete cascade,
 revision integer not null, kind text not null check(kind in ('receipt','confirmed','moved','cancelled','rain')),
 appointment text, previous text, operator_id uuid, created_at timestamptz not null default now(),
 delivery_state text not null default 'pending' check(delivery_state in ('pending','sending','sent','failed','uncertain','superseded')),
 unique(request_id, revision)
);
alter table public.shooting_messages enable row level security;
alter table public.shooting_slots enable row level security;
revoke all on public.shooting_messages, public.shooting_slots from public, anon, authenticated;
grant select,update on public.shooting_messages to service_role;

create or replace function public.shooting_log_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.shooting_messages(request_id,revision,kind) values(new.request_id,0,'receipt') on conflict do nothing;
 return new;
end $$;
drop trigger if exists shooting_receipt on public.shooting_receipt_queue;
create trigger shooting_receipt after insert on public.shooting_receipt_queue for each row execute function public.shooting_log_receipt();
insert into public.shooting_messages(request_id,revision,kind,delivery_state)
select request_id,0,'receipt',delivery_state from public.shooting_receipt_queue on conflict do nothing;

create or replace function public.shooting_require_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.has_role(auth.uid(),'admin') is not true then raise exception 'admin_required'; end if;
end $$;

create or replace function public.shooting_agenda() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.shooting_require_admin();
 return jsonb_build_object(
 'evenings',(select jsonb_agg(to_jsonb(e) order by day) from public.shooting_evenings e),
 'slots',(select jsonb_agg(to_jsonb(s) order by day,starts) from public.shooting_slots s),
 'requests',coalesce((select jsonb_agg(to_jsonb(items) order by created_at) from
 (select r.id,r.day,r.assigned_day,r.email,r.kind,r.brand,r.model,r.notes,r.preferred,r.image_permission,r.state,r.slot_id,r.appointment,r.revision,r.created_at,
 p.first_name,p.last_name,m.delivery_state,m.id as message_id
 from public.shooting_requests r left join public.profiles p on p.user_id=r.actor
 left join public.shooting_messages m on m.request_id=r.id and m.revision=r.revision) items),'[]'::jsonb));
end $$;

create or replace function public.shooting_schedule(p_id uuid,p_revision integer,p_slot uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.shooting_requests; s public.shooting_slots; place text; kind text; label text;
begin
 perform public.shooting_require_admin();
 -- A single transaction lock covers both evenings, including cross-evening moves and rain.
 perform pg_advisory_xact_lock(20261203,20261217);
 select * into strict r from public.shooting_requests where id=p_id for update;
 if r.revision is distinct from p_revision or r.state='cancelled' then raise exception 'stale_request'; end if;
 if p_slot is not null then
   if r.slot_id=p_slot then return; end if;
   select * into strict s from public.shooting_slots where id=p_slot;
   select meeting_place into place from public.shooting_evenings where day=s.day and not cancelled;
   if nullif(trim(place),'') is null then raise exception 'evening_unavailable'; end if;
   if (select count(*) from public.shooting_requests where slot_id=s.id)>=s.capacity then raise exception 'slot_full'; end if;
   kind := case when r.slot_id is null then 'confirmed' else 'moved' end;
   label := to_char(s.day,'DD/MM/YYYY') || ' · ' || to_char(s.starts,'HH24:MI') || ' · ' || place;
 else
   kind := 'cancelled';
 end if;
 update public.shooting_requests set slot_id=p_slot,assigned_day=coalesce(s.day,r.assigned_day),revision=revision+1,appointment=label,
 state=case when p_slot is null then 'cancelled' else 'confirmed' end where id=p_id;
 update public.shooting_messages set delivery_state='superseded' where request_id=p_id and delivery_state in ('pending','failed');
 insert into public.shooting_messages(request_id,revision,kind,appointment,previous,operator_id)
 values(p_id,r.revision+1,kind,label,r.appointment,auth.uid());
end $$;

create or replace function public.shooting_rain(p_day date) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.shooting_require_admin();
 perform pg_advisory_xact_lock(20261203,20261217);
 update public.shooting_evenings set cancelled=true,accepting=false where day=p_day;
 with affected as (
 select r.id,r.appointment from public.shooting_requests r left join public.shooting_slots s on s.id=r.slot_id
 where coalesce(s.day,r.day)=p_day and r.state<>'cancelled'
 ), changed as (
 update public.shooting_requests r set state='cancelled',slot_id=null,appointment=null,revision=revision+1
 from affected a where r.id=a.id returning r.id,r.revision,a.appointment
 )
 insert into public.shooting_messages(request_id,revision,kind,previous,operator_id)
 select id,revision,'rain',coalesce(appointment,to_char(p_day,'DD/MM/YYYY')),auth.uid() from changed;
 update public.shooting_messages m set delivery_state='superseded' from public.shooting_requests r
 where m.request_id=r.id and m.revision<r.revision and m.delivery_state in ('pending','failed');
end $$;

create or replace function public.shooting_capacity(p_slot uuid,p_capacity integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.shooting_require_admin();
 perform pg_advisory_xact_lock(20261203,20261217);
 if p_capacity < (select count(*) from public.shooting_requests where slot_id=p_slot) then raise exception 'slot_occupied'; end if;
 update public.shooting_slots set capacity=p_capacity where id=p_slot;
end $$;
create table if not exists public.shooting_plate_access (
  request_id uuid not null references public.shooting_requests on delete cascade,
  operator_id uuid not null, accessed_at timestamptz not null default now()
);
alter table public.shooting_plate_access enable row level security;
revoke all on public.shooting_plate_access from public,anon,authenticated;
create or replace function public.shooting_plate(p_id uuid) returns text language plpgsql volatile security definer set search_path='' as $$
begin
 perform public.shooting_require_admin();
 insert into public.shooting_plate_access(request_id,operator_id) values(p_id,auth.uid());
 return (select plate from public.shooting_requests where id=p_id);
end $$;
revoke all on function public.shooting_log_receipt(),public.shooting_require_admin(),public.shooting_agenda(),public.shooting_schedule(uuid,integer,uuid),public.shooting_capacity(uuid,integer),public.shooting_plate(uuid),public.shooting_rain(date) from public,anon,authenticated;
grant execute on function public.shooting_agenda(),public.shooting_schedule(uuid,integer,uuid),public.shooting_capacity(uuid,integer),public.shooting_plate(uuid),public.shooting_rain(date) to authenticated;
create or replace function public.shooting_configure(p_day date,p_open boolean,p_place text,p_version text,p_privacy text,p_images text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.shooting_evenings;
begin
 perform public.shooting_require_admin();
 perform pg_advisory_xact_lock(20261203,20261217);
 select * into strict e from public.shooting_evenings where day=p_day for update;
 if e.policy_version=trim(p_version) and (e.privacy_text<>p_privacy or e.image_text<>p_images) then raise exception 'new_version_required'; end if;
 if e.meeting_place<>trim(p_place) and exists(select 1 from public.shooting_requests r join public.shooting_slots s on r.slot_id=s.id where s.day=p_day)
 then raise exception 'confirmed_meeting_place'; end if;
 update public.shooting_evenings set accepting=p_open,meeting_place=trim(p_place),policy_version=trim(p_version),privacy_text=p_privacy,image_text=p_images where day=p_day;
end $$;
revoke all on function public.shooting_configure(date,boolean,text,text,text,text) from public,anon;
grant execute on function public.shooting_configure(date,boolean,text,text,text,text) to authenticated;
commit;
