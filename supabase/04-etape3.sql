-- =====================================================================
-- Espace équipe Marius & Fanny — Étape 3
-- Paye et pourboire, banque d'heures, achats de marchandise,
-- jours de maladie payés.
-- Toutes ces données sont visibles par l'administratrice seulement.
-- À coller dans Supabase : SQL Editor → New query → Run
-- Ce script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

alter table public.app_settings add column if not exists bank_cap numeric(6,2) not null default 80;
alter table public.app_settings add column if not exists sick_per_year int not null default 2;

create table if not exists public.pay_periods (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  year        int not null,
  start_date  date not null,
  end_date    date not null,
  pct         numeric(5,2) not null default 70 check (pct between 0 and 100),
  laval       numeric(10,2) not null default 0 check (laval >= 0),
  mtl         numeric(10,2) not null default 0 check (mtl >= 0),
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.pay_rows (
  period_id   uuid not null references public.pay_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  hours       numeric(6,2) not null default 0 check (hours >= 0),
  grp         text not null check (grp in ('laval','mtl','prod','none')),
  name        text not null default '',
  primary key (period_id, employee_id)
);

create table if not exists public.pay_buys (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references public.pay_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  item        text not null,
  qty         numeric(10,3),
  unit        text not null default '',
  unit_price  numeric(10,2),
  amount      numeric(10,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);
create index if not exists pay_buys_period on public.pay_buys(period_id);

create table if not exists public.buy_catalog (
  slug        text primary key,
  item        text not null,
  unit        text not null default '',
  unit_price  numeric(10,2) not null
);

create table if not exists public.bank_adj (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_id   uuid references public.pay_periods(id) on delete set null,
  date        date not null default current_date,
  hours       numeric(6,2) not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.sick_days (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  note        text not null default '',
  ind         jsonb,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists sick_days_emp on public.sick_days(employee_id);

-- Une paye verrouillée ne peut plus être modifiée (heures, achats, montants).
create or replace function public.mf_pay_lock() returns trigger
language plpgsql set search_path = public as $$
declare pid uuid; lk boolean;
begin
  if tg_table_name = 'pay_periods' then
    if tg_op = 'DELETE' then
      if old.locked then raise exception 'Cette paye est verrouillée. Déverrouille-la avant de la supprimer.'; end if;
      return old;
    end if;
    if old.locked and new.locked then raise exception 'Cette paye est verrouillée.'; end if;
    return new;
  end if;
  pid := case when tg_op = 'DELETE' then old.period_id else new.period_id end;
  select locked into lk from public.pay_periods where id = pid;
  if coalesce(lk, false) then raise exception 'Cette paye est verrouillée.'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists mf_pay_lock on public.pay_periods;
create trigger mf_pay_lock before update or delete on public.pay_periods for each row execute function public.mf_pay_lock();
drop trigger if exists mf_pay_lock on public.pay_rows;
create trigger mf_pay_lock before insert or update or delete on public.pay_rows for each row execute function public.mf_pay_lock();
drop trigger if exists mf_pay_lock on public.pay_buys;
create trigger mf_pay_lock before insert or update or delete on public.pay_buys for each row execute function public.mf_pay_lock();
revoke execute on function public.mf_pay_lock() from public, anon, authenticated;

-- ---------- Sécurité : administratrice seulement ---------------------

alter table public.pay_periods enable row level security;
alter table public.pay_rows    enable row level security;
alter table public.pay_buys    enable row level security;
alter table public.buy_catalog enable row level security;
alter table public.bank_adj    enable row level security;
alter table public.sick_days   enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'mf3_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy mf3_periods on public.pay_periods for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf3_rows    on public.pay_rows    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf3_buys    on public.pay_buys    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf3_catalog on public.buy_catalog for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf3_adj     on public.bank_adj    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf3_sick    on public.sick_days   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Fin de l'étape 3.
