-- =====================================================================
-- Espace équipe Marius & Fanny — Documents au dossier de l'employé
-- L'administratrice dépose des documents dans le dossier d'un employé
-- (contravention, arrêt de travail, certificat…), et l'employé peut lui
-- envoyer des photos ou des PDF joints à un message.
-- Les fichiers sont dans un espace de stockage privé : jamais publics.
-- À coller dans Supabase : SQL Editor → New query → Run
-- Ce script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

-- Espace de stockage privé (10 Mo par fichier, photos et PDF seulement)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docs', 'docs', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

create table if not exists public.employee_docs (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  path        text not null unique,
  name        text not null,
  mime        text not null default '',
  size        int not null default 0,
  cat         text not null default 'Autre',
  note        text not null default '',
  uploaded_by text not null default 'admin' check (uploaded_by in ('admin','employé')),
  thread_id   uuid references public.threads(id) on delete set null,
  msg_id      uuid references public.thread_msgs(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists employee_docs_emp on public.employee_docs(employee_id);
create index if not exists employee_docs_thread on public.employee_docs(thread_id);

-- Nouveau type de message : « Document à transmettre »
alter table public.threads drop constraint if exists threads_type_check;
alter table public.threads add constraint threads_type_check check (type in ('suggestion','demande','question','autre','document'));

-- ---------- Sécurité : la fiche du document ----------------------------
alter table public.employee_docs enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'mf5_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
create policy mf5_docs_admin on public.employee_docs for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- l'employé voit seulement les documents qu'il a lui-même envoyés (jamais ceux déposés par la direction)
create policy mf5_docs_read on public.employee_docs for select to authenticated
  using (employee_id = public.my_employee_id() and uploaded_by = 'employé');
create policy mf5_docs_ins on public.employee_docs for insert to authenticated
  with check (employee_id = public.my_employee_id() and uploaded_by = 'employé'
              and path like public.my_employee_id()::text || '/%'
              and (thread_id is null or exists (select 1 from public.threads t where t.id = thread_id and t.employee_id = public.my_employee_id())));

-- ---------- Sécurité : les fichiers eux-mêmes ---------------------------
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'mf5_%' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;
-- administratrice : tout dans l'espace « docs »
create policy mf5_obj_admin on storage.objects for all to authenticated
  using (bucket_id = 'docs' and public.is_admin()) with check (bucket_id = 'docs' and public.is_admin());
-- employé : peut déposer seulement dans son propre dossier
create policy mf5_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'docs' and public.my_employee_id() is not null
              and (storage.foldername(name))[1] = public.my_employee_id()::text);
-- employé : peut relire seulement les fichiers qu'il a envoyés
create policy mf5_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'docs' and (storage.foldername(name))[1] = public.my_employee_id()::text
         and exists (select 1 from public.employee_docs d where d.path = objects.name and d.uploaded_by = 'employé'));

-- Fin.
