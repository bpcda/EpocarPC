-- External EPOCAR project, after shooting-slots.sql.
begin;
alter table public.shooting_requests add column if not exists gallery_permission boolean not null default false;
create or replace function public.submit_shooting_photo_request(
  p_key uuid,p_day date,p_garage uuid,p_kind public.vehicle_type,p_brand text,p_model text,
  p_plate text,p_save boolean,p_preferred time,p_notes text,p_version text,p_read boolean,p_images boolean,p_gallery boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare previous boolean; receipt uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select gallery_permission into previous from public.shooting_requests where actor=auth.uid() and retry_key=p_key;
  if found and previous is distinct from p_gallery then raise exception 'retry_conflict'; end if;
  receipt := public.submit_shooting_request(p_key,p_day,p_garage,p_kind,p_brand,p_model,p_plate,p_save,p_preferred,p_notes,p_version,p_read,p_images);
  if previous is null then update public.shooting_requests set gallery_permission=p_gallery where id=receipt; end if;
  return receipt;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shooting-photos','shooting-photos',false,10485760,array['image/jpeg']) on conflict(id) do nothing;
do $$ begin
  if (select public from storage.buckets where id='shooting-photos') then raise exception 'private_bucket_required'; end if;
end $$;
drop policy if exists shooting_photo_upload on storage.objects;
create policy shooting_photo_upload on storage.objects for insert to authenticated
with check(bucket_id='shooting-photos' and public.has_role(auth.uid(),'admin') and name ~ '^[0-9a-f-]{36}\.jpg$');
drop policy if exists shooting_photo_admin_read on storage.objects;
create policy shooting_photo_admin_read on storage.objects for select to authenticated
using(bucket_id='shooting-photos' and public.has_role(auth.uid(),'admin'));
-- Prevent a permissive policy for another bucket from granting access to these files.
drop policy if exists shooting_photo_private_read on storage.objects;
create policy shooting_photo_private_read on storage.objects as restrictive for select to public
using(bucket_id<>'shooting-photos' or public.has_role(auth.uid(),'admin'));

create table if not exists public.shooting_photos(
  id uuid primary key, day date not null, slot_id uuid not null, recipients uuid[] not null,
  delivered_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '720 hours'),
  eligible boolean not null, gallery_id uuid unique references public.gallery_images(id) on delete set null
);
alter table public.shooting_photos enable row level security;
revoke all on public.shooting_photos from public,anon,authenticated;
grant select,delete on public.shooting_photos to service_role;

create or replace function public.shooting_deliver_photo(p_id uuid,p_slot uuid,p_requests uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[]; eligible boolean; day_value date; prior public.shooting_photos;
begin
  perform public.shooting_require_admin();
  perform pg_advisory_xact_lock(20261203,20261217);
  select array_agg(distinct v order by v) into ids from unnest(p_requests) v;
  select * into prior from public.shooting_photos where id=p_id;
  if found then
    if prior.slot_id=p_slot and prior.recipients=ids then return; end if;
    raise exception 'different_delivery';
  end if;
  select s.day into day_value from public.shooting_slots s where s.id=p_slot;
  if day_value is null or ids is null or cardinality(ids)<>(select count(*) from public.shooting_requests
       where id=any(ids) and slot_id=p_slot and state='confirmed') then raise exception 'invalid_recipients'; end if;
  if not exists(select 1 from storage.objects where bucket_id='shooting-photos' and name=p_id::text||'.jpg'
    and created_at>now()-interval '1 hour') then raise exception 'upload_required'; end if;
  select bool_and(gallery_permission) into eligible from public.shooting_requests where id=any(ids);
  insert into public.shooting_photos(id,day,slot_id,recipients,eligible) values(p_id,day_value,p_slot,ids,eligible);
end $$;

create or replace function public.my_shooting_photos(p_id uuid default null)
returns table(id uuid,day date,expires_at timestamptz) language sql stable security definer set search_path='' as $$
  select p.id,p.day,p.expires_at from public.shooting_photos p
  where (p_id is null or p.id=p_id) and now()<p.expires_at and exists
    (select 1 from public.shooting_requests r where r.id=any(p.recipients) and r.actor=auth.uid())
  order by p.delivered_at desc,p.id
$$;

create or replace function public.shooting_photo_admin(p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.shooting_require_admin();
  return jsonb_build_object(
    'permissions',(select coalesce(jsonb_object_agg(r.id,r.gallery_permission),'{}') from public.shooting_requests r
      join public.shooting_slots s on s.id=r.slot_id where s.day=p_day and r.state='confirmed'),
    'photos',(select coalesce(jsonb_agg(to_jsonb(p) order by delivered_at desc),'[]') from public.shooting_photos p
      where day=p_day and (expires_at>now() or gallery_id is not null)));
end $$;

create or replace function public.shooting_publish_photo(p_id uuid,p_publish boolean,p_verified boolean)
returns void language plpgsql security definer set search_path='' as $$
declare photo public.shooting_photos; gallery uuid;
begin
  perform public.shooting_require_admin();
  select * into strict photo from public.shooting_photos where id=p_id for update;
  if not p_publish then
    delete from public.gallery_images where id=photo.gallery_id;
    return;
  end if;
  if photo.gallery_id is not null then return; end if;
  if p_verified is not true or not photo.eligible or photo.expires_at<=now() then raise exception 'publication_denied'; end if;
  gallery:=gen_random_uuid();
  insert into public.gallery_images(id,image_url,alt_text,uploaded_by)
  values(gallery,'https://cgbaunizlqqhctiiogok.supabase.co/functions/v1/shooting-photo?gallery='||gallery,
    'Natale su Ruote · '||to_char(photo.day,'DD/MM/YYYY'),auth.uid());
  update public.shooting_photos set gallery_id=gallery where id=p_id;
end $$;

revoke all on function public.submit_shooting_photo_request(uuid,date,uuid,public.vehicle_type,text,text,text,boolean,time,text,text,boolean,boolean,boolean),
 public.shooting_deliver_photo(uuid,uuid,uuid[]),public.my_shooting_photos(uuid),public.shooting_photo_admin(date),public.shooting_publish_photo(uuid,boolean,boolean)
 from public,anon,authenticated;
grant execute on function public.submit_shooting_photo_request(uuid,date,uuid,public.vehicle_type,text,text,text,boolean,time,text,text,boolean,boolean,boolean),
 public.shooting_deliver_photo(uuid,uuid,uuid[]),public.my_shooting_photos(uuid),public.shooting_photo_admin(date),public.shooting_publish_photo(uuid,boolean,boolean)
 to authenticated;
commit;
