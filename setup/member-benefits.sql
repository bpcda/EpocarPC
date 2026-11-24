begin;
create table if not exists public.member_benefits (
  id uuid primary key default gen_random_uuid(),
  business text not null check (length(btrim(business)) between 1 and 160),
  benefit text not null check (length(btrim(benefit)) between 1 and 1200),
  conditions text not null default '' check (length(conditions)<=2000),
  redemption text not null check (length(btrim(redemption)) between 1 and 1200),
  published boolean not null default false,
  revision integer not null default 1
);
alter table public.member_benefits enable row level security;
revoke all on public.member_benefits from public, anon, authenticated;
grant select on public.member_benefits to anon, authenticated;
grant insert(id,business,benefit,conditions,redemption,published),update(business,benefit,conditions,redemption,published),delete
  on public.member_benefits to authenticated;

drop policy if exists benefits_online on public.member_benefits;
create policy benefits_online on public.member_benefits for select to anon,authenticated using (published);
drop policy if exists benefits_admin on public.member_benefits;
create policy benefits_admin on public.member_benefits for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.member_benefit_revision() returns trigger language plpgsql set search_path='' as $$
begin
  new.revision:=old.revision+1;
  return new;
end $$;
drop trigger if exists member_benefit_revision on public.member_benefits;
create trigger member_benefit_revision before update on public.member_benefits
  for each row execute function public.member_benefit_revision();
commit;
