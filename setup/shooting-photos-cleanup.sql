-- Apply after shooting-photos.sql on the external EPOCAR project.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create table if not exists public.shooting_photo_cleanup_key(
 id boolean primary key check(id), secret uuid not null default gen_random_uuid()
);
alter table public.shooting_photo_cleanup_key enable row level security;
revoke all on public.shooting_photo_cleanup_key from public,anon,authenticated,service_role;
insert into public.shooting_photo_cleanup_key(id) values(true) on conflict do nothing;
create or replace function public.shooting_photo_cleanup_batch(p_secret uuid)
returns table(name text) language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.shooting_photo_cleanup_key where secret=p_secret) then raise exception 'forbidden'; end if;
  delete from public.shooting_photos p where expires_at<=now() and gallery_id is null;
  return query select o.name from storage.objects o where bucket_id='shooting-photos'
    and o.created_at<now()-interval '24 hours'
    and not exists(select 1 from public.shooting_photos p where o.name=p.id::text||'.jpg')
    order by o.created_at limit 100;
end $$;
revoke all on function public.shooting_photo_cleanup_batch(uuid) from public,anon,authenticated;
grant execute on function public.shooting_photo_cleanup_batch(uuid) to service_role;
select cron.schedule('epocar-shooting-photo-cleanup','17 * * * *',$job$
  select net.http_post(url:='https://cgbaunizlqqhctiiogok.supabase.co/functions/v1/shooting-photo?cleanup=1',
    headers:=jsonb_build_object('Content-Type','application/json','X-Cleanup-Key',(select secret from public.shooting_photo_cleanup_key)),
    body:='{}'::jsonb,timeout_milliseconds:=30000)
$job$);
commit;
