-- Review on the external project. Collection remains closed until explicitly enabled.
begin;
create table if not exists public.shooting_evenings (
  day date primary key,
  accepting boolean not null default false,
  policy_version text not null default '',
  privacy_text text not null default '',
  image_text text not null default '',
  check (not accepting or (trim(policy_version) <> '' and trim(privacy_text) <> '' and trim(image_text) <> ''))
);
insert into public.shooting_evenings(day) values ('2026-12-03'), ('2026-12-17') on conflict do nothing;

create table if not exists public.shooting_requests (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  retry_key uuid not null,
  fingerprint text not null,
  day date not null references public.shooting_evenings(day),
  garage_id uuid references public.vehicles(id) on delete set null,
  kind public.vehicle_type not null,
  brand text not null check (length(trim(brand)) between 1 and 100),
  model text not null check (length(trim(model)) between 1 and 100),
  plate text not null check (plate ~ '^[A-Z0-9]{1,20}$'),
  preferred time check (preferred between '18:30' and '19:30'),
  notes text not null check (length(notes) <= 1500),
  email text not null,
  policy_version text not null,
  privacy_text text not null,
  image_text text not null,
  image_permission boolean not null,
  created_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending','confirmed','cancelled')),
  unique(actor,retry_key)
);
create unique index if not exists shooting_active_vehicle on public.shooting_requests(actor,day,plate) where state <> 'cancelled';
create table if not exists public.shooting_receipt_queue (
  request_id uuid primary key references public.shooting_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  delivery_state text not null default 'pending' check (delivery_state in ('pending','sending','sent','failed','uncertain'))
);
grant select on public.shooting_requests to service_role;
grant select,update on public.shooting_receipt_queue to service_role;
alter table public.shooting_evenings enable row level security;
alter table public.shooting_requests enable row level security;
alter table public.shooting_receipt_queue enable row level security;
revoke all on public.shooting_evenings, public.shooting_requests, public.shooting_receipt_queue from public, anon, authenticated;
grant select on public.shooting_evenings to authenticated;
drop policy if exists shooting_evenings_read on public.shooting_evenings;
create policy shooting_evenings_read on public.shooting_evenings for select to authenticated using (true);
grant select (id,actor,day,brand,model,state,created_at) on public.shooting_requests to authenticated;
drop policy if exists shooting_own_read on public.shooting_requests;
create policy shooting_own_read on public.shooting_requests for select to authenticated using (actor=auth.uid());

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
  if not found or not evening.accepting or (current_timestamp at time zone 'Europe/Rome') >= p_day + time '18:30'
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
revoke all on function public.submit_shooting_request(uuid,date,uuid,public.vehicle_type,text,text,text,boolean,time,text,text,boolean,boolean) from public, anon;
grant execute on function public.submit_shooting_request(uuid,date,uuid,public.vehicle_type,text,text,text,boolean,time,text,text,boolean,boolean) to authenticated;
commit;
