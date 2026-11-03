-- =====================================================================
-- Espace équipe Marius & Fanny — Jours fériés dans la paye
-- Liste des jours fériés, et possibilité d'ajuster à la main les heures
-- de férié d'un employé pour une paye.
-- À coller dans Supabase : SQL Editor → New query → Run
-- Ce script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

create table if not exists public.holidays (
  id    uuid primary key default gen_random_uuid(),
  date  date not null unique,
  name  text not null
);

-- Heures de férié fixées à la main (vide = calcul automatique)
alter table public.pay_rows add column if not exists hol_override numeric(6,2) check (hol_override is null or hol_override >= 0);

-- Un jour férié qui tombe dans une paye verrouillée ne peut être ni ajouté, ni retiré, ni déplacé.
create or replace function public.mf_hol_lock() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and exists (select 1 from public.pay_periods where locked and old.date between start_date and end_date) then
    raise exception 'Ce jour férié fait partie d’une paye verrouillée.';
  end if;
  if tg_op in ('INSERT','UPDATE') and exists (select 1 from public.pay_periods where locked and new.date between start_date and end_date) then
    raise exception 'Ce jour férié tombe dans une paye verrouillée.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists mf_hol_lock on public.holidays;
create trigger mf_hol_lock before insert or update or delete on public.holidays for each row execute function public.mf_hol_lock();
revoke execute on function public.mf_hol_lock() from public, anon, authenticated;

alter table public.holidays enable row level security;
drop policy if exists mf6_hol on public.holidays;
create policy mf6_hol on public.holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Fin.
