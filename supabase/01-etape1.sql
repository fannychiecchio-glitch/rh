-- =====================================================================
-- Espace équipe Marius & Fanny — Étape 1
-- À coller dans Supabase : SQL Editor → New query → Run
-- Ce script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  first_name  text not null,
  last_name   text not null,
  email       text not null unique,
  poste       text not null default '',
  magasin     text not null default 'Laval' check (magasin in ('Laval','Montréal','Production')),
  tip_group   text not null default 'laval' check (tip_group in ('laval','mtl','prod','none')),
  start_date  date not null default current_date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','employee')),
  created_at  timestamptz not null default now()
);

create table if not exists public.employee_info (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  birth       date,
  street      text, apt text, city text, province text default 'QC', postal text,
  phone       text, email_perso text,
  em_name     text, em_rel text, em_phone text, em_phone2 text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.salary_history (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective   date not null,
  rate        numeric(8,2) not null check (rate >= 0),
  note        text default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.perks (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date        date not null default current_date,
  descr       text not null,
  value       numeric(10,2),
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_notes (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.handbook_meta (
  id          int primary key default 1 check (id = 1),
  version     int not null default 1,
  version_name text not null default 'Version 1',
  headline    text not null default 'Tout ce qu’il faut savoir pour bien travailler avec nous',
  updated_at  timestamptz not null default now()
);
insert into public.handbook_meta (id) values (1) on conflict do nothing;

create table if not exists public.handbook_sections (
  id          uuid primary key default gen_random_uuid(),
  position    int not null default 0,
  title       text not null,
  body        text not null default '',
  aud         text not null default 'all' check (aud in ('all','vente','prod')),
  updated_at  timestamptz not null default now()
);

create table if not exists public.handbook_reads (
  employee_id uuid not null references public.employees(id) on delete cascade,
  version     int not null,
  read_at     timestamptz not null default now(),
  primary key (employee_id, version)
);

create table if not exists public.news (
  id          uuid primary key default gen_random_uuid(),
  date        date not null default current_date,
  title       text not null,
  body        text not null default '',
  until       date not null default (current_date + 30),
  rsvp        boolean not null default false,
  rsvp_due    date,
  created_at  timestamptz not null default now()
);

create table if not exists public.news_rsvp (
  news_id     uuid not null references public.news(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  answer      text not null check (answer in ('oui','non')),
  answered_at timestamptz not null default now(),
  primary key (news_id, employee_id)
);

-- ---------- Fonctions d'accès ----------------------------------------

-- Administratrice : rôle admin ET connexion confirmée par la validation en deux étapes.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Rôle de la personne connectée (lisible même avant la validation en deux étapes).
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Dossier de l'employé connecté, seulement s'il est actif.
create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() and active;
$$;

grant execute on function public.is_admin(), public.my_role(), public.my_employee_id() to authenticated;

-- ---------- Sécurité ligne par ligne (RLS) ---------------------------

alter table public.employees         enable row level security;
alter table public.profiles          enable row level security;
alter table public.employee_info     enable row level security;
alter table public.salary_history    enable row level security;
alter table public.perks             enable row level security;
alter table public.admin_notes       enable row level security;
alter table public.handbook_meta     enable row level security;
alter table public.handbook_sections enable row level security;
alter table public.handbook_reads    enable row level security;
alter table public.news              enable row level security;
alter table public.news_rsvp         enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'mf_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profils : chacun lit le sien ; l'administratrice lit tout. Aucune écriture depuis le site.
create policy mf_profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- employés : l'employé lit son propre dossier ; l'administratrice gère tout.
create policy mf_emp_read  on public.employees for select to authenticated
  using (public.is_admin() or (user_id = auth.uid() and active));
create policy mf_emp_admin on public.employees for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- fiche d'embauche : l'employé lit et modifie la sienne ; l'administratrice gère tout.
create policy mf_info_all on public.employee_info for all to authenticated
  using (public.is_admin() or employee_id = public.my_employee_id())
  with check (public.is_admin() or employee_id = public.my_employee_id());

-- salaire et avantages : lecture par l'employé concerné ; écriture par l'administratrice seulement.
create policy mf_sal_read  on public.salary_history for select to authenticated
  using (public.is_admin() or employee_id = public.my_employee_id());
create policy mf_sal_admin on public.salary_history for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy mf_perk_read  on public.perks for select to authenticated
  using (public.is_admin() or employee_id = public.my_employee_id());
create policy mf_perk_admin on public.perks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- notes de l'administratrice : invisibles pour les employés.
create policy mf_notes_admin on public.admin_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- cahier de l'employé : lecture par tous les comptes actifs ; écriture par l'administratrice.
create policy mf_hbm_read  on public.handbook_meta for select to authenticated
  using (public.is_admin() or public.my_employee_id() is not null);
create policy mf_hbm_admin on public.handbook_meta for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy mf_hbs_read  on public.handbook_sections for select to authenticated
  using (public.is_admin() or public.my_employee_id() is not null);
create policy mf_hbs_admin on public.handbook_sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy mf_hbr_read on public.handbook_reads for select to authenticated
  using (public.is_admin() or employee_id = public.my_employee_id());
create policy mf_hbr_ins  on public.handbook_reads for insert to authenticated
  with check (employee_id = public.my_employee_id());

-- nouvelles : lecture par tous les comptes actifs ; écriture par l'administratrice.
create policy mf_news_read  on public.news for select to authenticated
  using (public.is_admin() or (public.my_employee_id() is not null and until > current_date));
create policy mf_news_admin on public.news for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy mf_rsvp_read on public.news_rsvp for select to authenticated
  using (public.is_admin() or employee_id = public.my_employee_id());
create policy mf_rsvp_ins  on public.news_rsvp for insert to authenticated
  with check (employee_id = public.my_employee_id());
create policy mf_rsvp_upd  on public.news_rsvp for update to authenticated
  using (employee_id = public.my_employee_id()) with check (employee_id = public.my_employee_id());

-- ---------- Contenu de départ du cahier (seulement si vide) ----------

insert into public.handbook_sections (position, title, body, aud)
select * from (values
  (1, 'Bienvenue', 'Bienvenue dans l’équipe! Ce cahier rassemble ce que tu dois savoir pour bien travailler avec nous.

Texte de départ : modifie-le dans l’administration, section Communication.', 'all'),
  (2, 'Horaires et pointage', '- L’horaire est publié chaque jeudi pour la semaine suivante.
- Pointe à ton arrivée et à ton départ, en tenue de travail.', 'all'),
  (3, 'Tenue et hygiène', '- Tablier propre, cheveux attachés, filet ou casquette en production.
- Lavage des mains à l’arrivée et après chaque pause.', 'all')
) v(position, title, body, aud)
where not exists (select 1 from public.handbook_sections);

-- Fin de l'étape 1.
