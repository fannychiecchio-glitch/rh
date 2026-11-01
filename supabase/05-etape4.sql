-- =====================================================================
-- Espace équipe Marius & Fanny — Étape 4
-- Coffre chiffré (NAS, spécimen de chèque, permis), accidents de travail,
-- clés, anniversaires de service, formation, auto-évaluation annuelle,
-- liste d'accueil et nettoyage automatique.
-- À coller dans Supabase : SQL Editor → New query → Run
-- Ce script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

alter table public.employees add column if not exists needs_permis boolean not null default false;

-- ---------- Coffre chiffré --------------------------------------------
-- Le chiffrement se fait dans le navigateur. La base ne reçoit que du texte illisible :
-- la clé publique (pour chiffrer) et la clé privée elle-même chiffrée par le code du coffre.

create table if not exists public.vault_pub (
  id int primary key default 1 check (id = 1),
  pub text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.vault_key (
  id int primary key default 1 check (id = 1),
  enc_priv text not null, salt text not null, iv text not null, iter int not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.secure_items (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind        text not null check (kind in ('nas','cheque','permis')),
  wk text not null, iv text not null, ct text not null,
  created_at  timestamptz not null default now(),
  unique (employee_id, kind)
);
create table if not exists public.vault_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  action      text not null,
  employee_id uuid references public.employees(id) on delete cascade,
  emp_name    text not null default '',
  kind        text not null default ''
);
create index if not exists vault_log_at on public.vault_log(at desc);

-- Dépôt par l'employé : remplace son document précédent du même type et l'inscrit au journal.
create or replace function public.secure_put(p_kind text, p_wk text, p_iv text, p_ct text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_employee_id(); nm text;
begin
  if me is null then raise exception 'Accès refusé.'; end if;
  if not exists (select 1 from public.vault_pub) then raise exception 'Le coffre n’est pas encore activé.'; end if;
  if p_kind not in ('nas','cheque','permis') then raise exception 'Type invalide.'; end if;
  if length(p_ct) > 3000000 or length(p_wk) > 2000 or length(p_iv) > 100 then raise exception 'Document trop volumineux.'; end if;
  insert into public.secure_items (employee_id, kind, wk, iv, ct) values (me, p_kind, p_wk, p_iv, p_ct)
    on conflict (employee_id, kind) do update set wk = excluded.wk, iv = excluded.iv, ct = excluded.ct, created_at = now();
  select first_name || ' ' || last_name into nm from public.employees where id = me;
  insert into public.vault_log (action, employee_id, emp_name, kind)
    values ('Dépôt par l’employé', me, nm, case p_kind when 'nas' then 'Numéro d’assurance sociale' when 'cheque' then 'Spécimen de chèque' else 'Permis de conduire' end);
end $$;

-- L'employé voit seulement QUELS documents il a envoyés et quand, jamais leur contenu.
create or replace function public.my_secure_status() returns table (kind text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select kind, created_at from public.secure_items where employee_id = public.my_employee_id();
$$;

-- ---------- Accidents, clés, anniversaires ------------------------------

create table if not exists public.accidents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  date         date not null,
  time         text not null default '',
  place        text not null default '',
  kind         text not null default 'accident' check (kind in ('incident','premiers','accident')),
  injury       text not null default '',
  descr        text not null default '',
  witness      text not null default '',
  first_aid_by text not null default '',
  aid          text not null default '',
  off_days     int not null default 0 check (off_days >= 0),
  cnesst       boolean not null default false,
  actions      text not null default '',
  declared_by  text not null default 'admin' check (declared_by in ('admin','employé')),
  status       text not null default 'complété' check (status in ('à traiter','complété')),
  created_at   timestamptz not null default now()
);
create index if not exists accidents_emp on public.accidents(employee_id);

create table if not exists public.keys_held (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  descr       text not null,
  number      text not null default '',
  given       date not null default current_date,
  returned    date
);

create table if not exists public.recognitions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  years       int not null,
  date        date not null,
  msg         text not null,
  gift        text not null default '',
  created_at  timestamptz not null default now(),
  unique (employee_id, years)
);

-- ---------- Formation ---------------------------------------------------

create table if not exists public.training_modules (
  id       uuid primary key default gen_random_uuid(),
  position int not null default 0,
  title    text not null,
  aud      text not null default 'vente' check (aud in ('all','vente','prod'))
);
create table if not exists public.training_lessons (
  id        uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete cascade,
  position  int not null default 0,
  title     text not null,
  body      text not null default ''
);
create table if not exists public.training_done (
  employee_id uuid not null references public.employees(id) on delete cascade,
  lesson_id   uuid not null references public.training_lessons(id) on delete cascade,
  done_at     date not null default current_date,
  primary key (employee_id, lesson_id)
);

-- ---------- Auto-évaluation ----------------------------------------------

create table if not exists public.eval_template (
  id      int primary key default 1 check (id = 1),
  ratings jsonb not null,
  open    jsonb not null
);
insert into public.eval_template (id, ratings, open) values (1,
  '["Qualité de mon travail","Ponctualité et assiduité","Respect des recettes, des standards et des procédures","Hygiène, salubrité et sécurité","Esprit d’équipe et entraide","Initiative et autonomie","Communication avec mes collègues et la direction"]',
  '["De quoi es-tu le plus fier ou la plus fière depuis ta dernière évaluation?","Qu’est-ce que tu aimerais améliorer?","Quelle formation ou quel soutien t’aiderait?","Quels sont tes objectifs pour la prochaine année?","Autre commentaire pour la direction"]'
) on conflict do nothing;

create table if not exists public.evals (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  year         int not null,
  sent         date not null default current_date,
  due          date,
  status       text not null default 'à remplir' check (status in ('à remplir','brouillon','remise')),
  tpl          jsonb not null,
  answers      jsonb not null default '{"r":{},"o":{}}',
  submitted_at timestamptz,
  seen         boolean not null default false,
  unique (employee_id, year)
);
-- Notes de l'administratrice : table à part, jamais visible par l'employé.
create table if not exists public.eval_notes (
  eval_id uuid primary key references public.evals(id) on delete cascade,
  note    text not null default ''
);

create or replace function public.eval_save(p_id uuid, p_answers jsonb, p_submit boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(p_answers::text) > 30000 then raise exception 'Réponses trop longues.'; end if;
  update public.evals set answers = p_answers,
         status = case when p_submit then 'remise' else 'brouillon' end,
         submitted_at = case when p_submit then now() else null end
   where id = p_id and employee_id = public.my_employee_id() and status <> 'remise';
  if not found then raise exception 'Cette auto-évaluation ne peut plus être modifiée.'; end if;
end $$;

-- ---------- Liste d'accueil -----------------------------------------------

create table if not exists public.onb_steps (
  id       uuid primary key default gen_random_uuid(),
  position int not null default 0,
  label    text not null
);
insert into public.onb_steps (position, label)
select * from (values (1, 'Remise de l’uniforme et des tabliers'), (2, 'Remise de la clé ou de la carte d’accès'),
  (3, 'Formation en hygiène et salubrité alimentaires'), (4, 'Rencontre de fin de probation (3 mois)')) v(position, label)
where not exists (select 1 from public.onb_steps);

create table if not exists public.onb (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  started     date not null default current_date,
  closed      date
);
create table if not exists public.onb_done (
  employee_id uuid not null references public.employees(id) on delete cascade,
  step_id     uuid not null references public.onb_steps(id) on delete cascade,
  done_at     date not null default current_date,
  primary key (employee_id, step_id)
);

-- Chaque nouvel employé commence automatiquement avec une liste d'accueil.
create or replace function public.mf_onb_start() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.onb (employee_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists mf_onb_start on public.employees;
create trigger mf_onb_start after insert on public.employees for each row execute function public.mf_onb_start();
revoke execute on function public.mf_onb_start() from public, anon, authenticated;

-- ---------- Nettoyage automatique ----------------------------------------
-- Appelé par la plateforme à l'ouverture du tableau de bord de l'administratrice.
create or replace function public.mf_cleanup() returns json
language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int; n3 int;
begin
  if not public.is_admin() then raise exception 'Accès refusé.'; end if;
  delete from public.news where until < current_date; get diagnostics n1 = row_count;           -- nouvelles dont l'affichage est terminé
  delete from public.vault_log where at < now() - interval '2 years'; get diagnostics n2 = row_count; -- journal du coffre : 2 ans
  delete from public.notify_log where at < now() - interval '1 year'; get diagnostics n3 = row_count; -- journal des courriels : 1 an
  return json_build_object('news', n1, 'vault_log', n2, 'notify_log', n3);
end $$;

grant execute on function public.secure_put(text, text, text, text), public.my_secure_status(), public.eval_save(uuid, jsonb, boolean), public.mf_cleanup() to authenticated;

-- ---------- Sécurité ligne par ligne (RLS) ---------------------------

alter table public.vault_pub        enable row level security;
alter table public.vault_key        enable row level security;
alter table public.secure_items     enable row level security;
alter table public.vault_log        enable row level security;
alter table public.accidents        enable row level security;
alter table public.keys_held        enable row level security;
alter table public.recognitions     enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_done    enable row level security;
alter table public.eval_template    enable row level security;
alter table public.evals            enable row level security;
alter table public.eval_notes       enable row level security;
alter table public.onb_steps        enable row level security;
alter table public.onb              enable row level security;
alter table public.onb_done         enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'mf4_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- coffre : clé publique lisible par les employés actifs (pour chiffrer); tout le reste à l'administratrice
create policy mf4_vpub_read  on public.vault_pub for select to authenticated using (public.is_admin() or public.my_employee_id() is not null);
create policy mf4_vpub_admin on public.vault_pub for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_vkey_admin on public.vault_key for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_sec_admin  on public.secure_items for select to authenticated using (public.is_admin());
create policy mf4_sec_del    on public.secure_items for delete to authenticated using (public.is_admin());
create policy mf4_vlog_read  on public.vault_log for select to authenticated using (public.is_admin());
create policy mf4_vlog_ins   on public.vault_log for insert to authenticated with check (public.is_admin());

-- accidents : l'employé déclare et voit ses déclarations; l'administratrice gère le registre
create policy mf4_acc_admin on public.accidents for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_acc_read  on public.accidents for select to authenticated using (employee_id = public.my_employee_id());
create policy mf4_acc_ins   on public.accidents for insert to authenticated
  with check (employee_id = public.my_employee_id() and declared_by = 'employé' and status = 'à traiter' and off_days = 0 and not cnesst and actions = '');

-- clés : administratrice seulement
create policy mf4_keys_admin on public.keys_held for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- anniversaires : l'employé voit les siens
create policy mf4_rec_admin on public.recognitions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_rec_read  on public.recognitions for select to authenticated using (employee_id = public.my_employee_id());

-- formation : contenu lisible par les employés actifs; progression personnelle
create policy mf4_tm_read  on public.training_modules for select to authenticated using (public.is_admin() or public.my_employee_id() is not null);
create policy mf4_tm_admin on public.training_modules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_tl_read  on public.training_lessons for select to authenticated using (public.is_admin() or public.my_employee_id() is not null);
create policy mf4_tl_admin on public.training_lessons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_td_read  on public.training_done for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy mf4_td_ins   on public.training_done for insert to authenticated with check (employee_id = public.my_employee_id());
create policy mf4_td_admin on public.training_done for delete to authenticated using (public.is_admin());

-- auto-évaluation : l'employé voit la sienne et la remplit par eval_save; notes de la direction privées
create policy mf4_et_admin  on public.eval_template for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_ev_admin  on public.evals for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_ev_read   on public.evals for select to authenticated using (employee_id = public.my_employee_id());
create policy mf4_evn_admin on public.eval_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- liste d'accueil : l'employé voit seulement si sa liste est ouverte
create policy mf4_os_admin on public.onb_steps for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_onb_admin on public.onb for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf4_onb_read  on public.onb for select to authenticated using (employee_id = public.my_employee_id());
create policy mf4_od_admin on public.onb_done for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Les employés déjà inscrits n'ont pas de liste d'accueil (seulement les nouveaux).

-- Fin de l'étape 4.
