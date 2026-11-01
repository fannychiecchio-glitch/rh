-- =====================================================================
-- Espace équipe Marius & Fanny — Étape 2
-- Vacances et calendriers, avertissements, contrats signés, messages,
-- avis par courriel.
-- À coller dans Supabase : SQL Editor → New query → Run
-- Ce script peut être relancé sans danger (il ne supprime aucune donnée).
-- =====================================================================

-- ---------- Réglages de l'entreprise ----------------------------------

create table if not exists public.app_settings (
  id                 int primary key default 1 check (id = 1),
  company            text not null default 'Marius & Fanny',
  company_address    text not null default '',
  company_rep        text not null default '',
  company_rep_title  text not null default '',
  company_city       text not null default 'Laval',
  store_laval        text not null default '',
  store_mtl          text not null default '',
  store_prod         text not null default '',
  admin_signer       text not null default '',
  notify_email       text not null default '',
  mail_off           text[] not null default '{}',
  updated_at         timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

-- ---------- Vacances --------------------------------------------------

create table if not exists public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  type         text not null default 'Vacances',
  start_date   date not null,
  end_date     date not null,
  note         text not null default '',
  status       text not null default 'en attente'
               check (status in ('en attente','acceptée','refusée','contre-proposition','annulée')),
  admin_msg    text not null default '',
  prop_start   date,
  prop_end     date,
  prop_msg     text not null default '',
  seen         boolean not null default true,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  check (end_date >= start_date)
);
create index if not exists leave_requests_emp on public.leave_requests(employee_id);

-- ---------- Avertissements --------------------------------------------

create table if not exists public.warnings (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  date         date not null default current_date,
  level        text not null default 'Écrit' check (level in ('Verbal consigné','Écrit','Final')),
  title        text not null,
  body         text not null,
  ack_at       timestamptz,
  comment      text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists warnings_emp on public.warnings(employee_id);

-- ---------- Contrats --------------------------------------------------

create table if not exists public.contract_templates (
  id        uuid primary key default gen_random_uuid(),
  position  int not null default 0,
  poste     text not null,
  title     text not null,
  body      text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  title           text not null,
  body            text not null,
  body_sha256     text,
  opts            jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  emp_sig_name    text, emp_sig_img text, emp_sig_at timestamptz, emp_sig_how text,
  admin_sig_name  text, admin_sig_img text, admin_sig_at timestamptz,
  completed_at    timestamptz
);
create index if not exists contracts_emp on public.contracts(employee_id);

-- ---------- Messages --------------------------------------------------

create table if not exists public.threads (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  type         text not null default 'question' check (type in ('suggestion','demande','question','autre')),
  subject      text not null,
  status       text not null default 'ouvert' check (status in ('ouvert','fermé')),
  unread_admin boolean not null default true,
  unread_emp   boolean not null default false,
  created_at   timestamptz not null default now(),
  last_at      timestamptz not null default now()
);
create index if not exists threads_emp on public.threads(employee_id);

create table if not exists public.thread_msgs (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  from_admin  boolean not null default false,
  body        text not null check (length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index if not exists thread_msgs_thread on public.thread_msgs(thread_id);

-- ---------- Journal des courriels envoyés -----------------------------

create table if not exists public.notify_log (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz not null default now(),
  kind     text not null,
  ref_id   uuid,
  to_addr  text not null,
  subject  text not null,
  ok       boolean not null default true,
  error    text
);
create index if not exists notify_log_at on public.notify_log(at desc);

-- ---------- Protection des contrats -----------------------------------
-- Le texte d'un contrat ne peut plus changer dès qu'une signature y est apposée.
-- Les signatures ne peuvent être posées que par la fonction contract_sign, et jamais remplacées.
-- Un contrat signé par les deux parties ne peut pas être supprimé.

create or replace function public.mf_contract_guard() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.emp_sig_at is not null or new.admin_sig_at is not null or new.completed_at is not null then
      raise exception 'Un nouveau contrat ne peut pas être déjà signé.';
    end if;
    new.body_sha256 := encode(digest(new.body, 'sha256'), 'hex');
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.completed_at is not null then raise exception 'Un contrat signé par les deux parties ne peut pas être supprimé.'; end if;
    return old;
  end if;
  if (old.emp_sig_at is not null or old.admin_sig_at is not null)
     and (new.body is distinct from old.body or new.title is distinct from old.title) then
    raise exception 'Le texte d’un contrat signé ne peut plus être modifié.';
  end if;
  if new.body is distinct from old.body then
    new.body_sha256 := encode(digest(new.body, 'sha256'), 'hex');
  end if;
  if coalesce(current_setting('mf.signing', true), '') <> '1' and (
       new.emp_sig_name is distinct from old.emp_sig_name or new.emp_sig_img is distinct from old.emp_sig_img
    or new.emp_sig_at is distinct from old.emp_sig_at or new.emp_sig_how is distinct from old.emp_sig_how
    or new.admin_sig_name is distinct from old.admin_sig_name or new.admin_sig_img is distinct from old.admin_sig_img
    or new.admin_sig_at is distinct from old.admin_sig_at or new.completed_at is distinct from old.completed_at) then
    raise exception 'Les signatures ne peuvent pas être modifiées directement.';
  end if;
  return new;
end $$;

drop trigger if exists mf_contract_guard on public.contracts;
create trigger mf_contract_guard before insert or update or delete on public.contracts
  for each row execute function public.mf_contract_guard();

-- Signer un contrat. p_who = 'emp' (l'employé, ou l'employé en personne sur l'appareil de l'administratrice) ou 'admin'.
create or replace function public.contract_sign(p_id uuid, p_who text, p_name text, p_img text)
returns public.contracts
language plpgsql security definer set search_path = public as $$
declare c public.contracts; me uuid := public.my_employee_id(); adm boolean := public.is_admin();
begin
  select * into c from public.contracts where id = p_id for update;
  if not found then raise exception 'Contrat introuvable.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom est obligatoire.'; end if;
  if p_img is null or p_img not like 'data:image/png;base64,%' or length(p_img) > 400000 then
    raise exception 'Signature invalide.';
  end if;
  perform set_config('mf.signing', '1', true);
  if p_who = 'emp' then
    if c.emp_sig_at is not null then raise exception 'Ce contrat est déjà signé par l’employé.'; end if;
    if c.employee_id = me then
      update public.contracts set emp_sig_name = trim(p_name), emp_sig_img = p_img, emp_sig_at = now(), emp_sig_how = 'depuis son compte' where id = p_id;
    elsif adm then
      update public.contracts set emp_sig_name = trim(p_name), emp_sig_img = p_img, emp_sig_at = now(), emp_sig_how = 'en personne, sur l’appareil de l’employeur' where id = p_id;
    else raise exception 'Accès refusé.'; end if;
  elsif p_who = 'admin' then
    if not adm then raise exception 'Accès refusé.'; end if;
    if c.admin_sig_at is not null then raise exception 'Ce contrat est déjà signé par l’employeur.'; end if;
    update public.contracts set admin_sig_name = trim(p_name), admin_sig_img = p_img, admin_sig_at = now() where id = p_id;
    update public.app_settings set admin_signer = trim(p_name) where id = 1;
  else raise exception 'Signataire invalide.'; end if;
  update public.contracts set completed_at = greatest(emp_sig_at, admin_sig_at)
    where id = p_id and emp_sig_at is not null and admin_sig_at is not null and completed_at is null;
  perform set_config('mf.signing', '', true);
  select * into c from public.contracts where id = p_id;
  return c;
end $$;

-- ---------- Actions des employés (vacances, avertissements, messages) --

create or replace function public.leave_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.leave_requests set status = 'annulée'
   where id = p_id and employee_id = public.my_employee_id() and status in ('en attente','contre-proposition');
  if not found then raise exception 'Cette demande ne peut pas être annulée.'; end if;
end $$;

create or replace function public.leave_answer(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.leave_requests
       set start_date = prop_start, end_date = prop_end, status = 'acceptée', admin_msg = 'Nouvelles dates acceptées.',
           prop_start = null, prop_end = null, prop_msg = '', decided_at = now(), seen = true
     where id = p_id and employee_id = public.my_employee_id() and status = 'contre-proposition' and prop_start is not null;
  else
    update public.leave_requests
       set status = 'en attente', admin_msg = 'Tu as refusé les dates proposées. Ta demande initiale est de retour en attente.',
           prop_start = null, prop_end = null, prop_msg = '', seen = true
     where id = p_id and employee_id = public.my_employee_id() and status = 'contre-proposition';
  end if;
  if not found then raise exception 'Cette proposition n’est plus valide.'; end if;
end $$;

create or replace function public.leave_seen(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.leave_requests set seen = true where id = p_id and employee_id = public.my_employee_id();
$$;

create or replace function public.warning_ack(p_id uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.warnings set ack_at = now(), comment = left(coalesce(trim(p_comment), ''), 3000)
   where id = p_id and employee_id = public.my_employee_id() and ack_at is null;
  if not found then raise exception 'Avertissement introuvable ou déjà confirmé.'; end if;
end $$;

create or replace function public.thread_seen(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.threads set unread_emp = false where id = p_id and employee_id = public.my_employee_id();
$$;

-- Chaque nouveau message met à jour la conversation (date et pastille « non lu »).
create or replace function public.mf_thread_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.threads
     set last_at = new.created_at,
         unread_admin = case when new.from_admin then unread_admin else true end,
         unread_emp   = case when new.from_admin then true else unread_emp end
   where id = new.thread_id;
  return new;
end $$;
drop trigger if exists mf_thread_touch on public.thread_msgs;
create trigger mf_thread_touch after insert on public.thread_msgs
  for each row execute function public.mf_thread_touch();

grant execute on function public.contract_sign(uuid, text, text, text), public.leave_cancel(uuid),
  public.leave_answer(uuid, boolean), public.leave_seen(uuid), public.warning_ack(uuid, text),
  public.thread_seen(uuid) to authenticated;
revoke execute on function public.mf_contract_guard(), public.mf_thread_touch() from public, anon, authenticated;

-- ---------- Sécurité ligne par ligne (RLS) ---------------------------

alter table public.app_settings       enable row level security;
alter table public.leave_requests     enable row level security;
alter table public.warnings           enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contracts          enable row level security;
alter table public.threads            enable row level security;
alter table public.thread_msgs        enable row level security;
alter table public.notify_log         enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'mf2_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- réglages, modèles de contrat et journal des courriels : administratrice seulement
create policy mf2_settings on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_tpl      on public.contract_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_log      on public.notify_log for select to authenticated using (public.is_admin());

-- vacances : l'employé voit ses demandes et en crée de nouvelles; le reste passe par les fonctions ci-dessus
create policy mf2_leave_admin on public.leave_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_leave_read  on public.leave_requests for select to authenticated using (employee_id = public.my_employee_id());
create policy mf2_leave_ins   on public.leave_requests for insert to authenticated
  with check (employee_id = public.my_employee_id() and status = 'en attente' and admin_msg = '' and prop_start is null
              and prop_end is null and decided_at is null and start_date >= current_date - 1);

-- avertissements : lecture par l'employé concerné; confirmation par warning_ack
create policy mf2_warn_admin on public.warnings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_warn_read  on public.warnings for select to authenticated using (employee_id = public.my_employee_id());

-- contrats : lecture par l'employé concerné; signature par contract_sign
create policy mf2_ctr_admin on public.contracts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_ctr_read  on public.contracts for select to authenticated using (employee_id = public.my_employee_id());

-- messages : l'employé voit et écrit dans ses propres conversations ouvertes
create policy mf2_thr_admin on public.threads for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_thr_read  on public.threads for select to authenticated using (employee_id = public.my_employee_id());
create policy mf2_thr_ins   on public.threads for insert to authenticated
  with check (employee_id = public.my_employee_id() and status = 'ouvert');
create policy mf2_msg_admin on public.thread_msgs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy mf2_msg_read  on public.thread_msgs for select to authenticated
  using (exists (select 1 from public.threads t where t.id = thread_id and t.employee_id = public.my_employee_id()));
create policy mf2_msg_ins   on public.thread_msgs for insert to authenticated
  with check (not from_admin and exists (select 1 from public.threads t where t.id = thread_id
              and t.employee_id = public.my_employee_id() and t.status = 'ouvert'));

-- ---------- Modèles de contrat de départ (seulement si vide) ----------

insert into public.contract_templates (position, poste, title, body)
select * from (values
  (1, 'Vente', 'Contrat — Préposé(e) à la vente', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
PRÉPOSÉ(E) À LA VENTE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) accueillir, conseiller et servir la clientèle au comptoir, au téléphone et pour les commandes en ligne;
b) présenter les produits, renseigner la clientèle sur leurs ingrédients et leurs allergènes à partir des fiches fournies par l’Employeur, sans jamais improviser une réponse à ce sujet;
c) opérer la caisse enregistreuse et le terminal de paiement, encaisser les ventes et remettre la facture conformément aux exigences de Revenu Québec;
d) effectuer l’ouverture et la fermeture de caisse selon la procédure en vigueur, consigner et signaler tout écart au registre prévu à cette fin;
e) prendre, consigner et faire le suivi des commandes spéciales;
f) mettre en place, garnir, étiqueter et entretenir les comptoirs, réfrigérateurs et vitrines, en assurant la rotation des produits;
g) emballer les produits et préparer les boîtes-cadeaux;
h) assurer la propreté des aires de vente, des aires de service et des équipements.
3.2 Aucun diplôme particulier n’est exigé. L’Employé(e) doit faire preuve de courtoisie, de rigueur dans la manipulation de l’argent et d’une bonne maîtrise du français à l’oral.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de jour, de soir et de fin de semaine, ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) applique la procédure de manipulation de l’argent et se lave les mains après avoir manipulé de l’argent et avant de toucher aux aliments. Il ou elle utilise les pinces, gants et ustensiles fournis pour servir les produits non emballés.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$),
  (2, 'Livreur', 'Contrat — Livreur / livreuse', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
LIVREUR / LIVREUSE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) effectuer les livraisons aux clients, aux établissements de l’Employeur et aux points de vente, selon les itinéraires et les horaires établis;
b) charger, arrimer et décharger la marchandise de façon sécuritaire;
c) maintenir la chaîne de froid et les conditions de transport requises pour les produits alimentaires;
d) vérifier les bons de livraison, faire signer les preuves de réception et, le cas échéant, percevoir les paiements selon la procédure établie;
e) effectuer l’inspection avant départ du véhicule, le garder propre et signaler sans délai toute défectuosité, tout accident ou toute contravention;
f) accomplir des tâches de soutien à la production ou à l’entrepôt entre les livraisons.
3.2 L’Employé(e) doit détenir, pendant toute la durée de son emploi, un permis de conduire valide de la classe requise pour le véhicule utilisé. Il ou elle consent à ce que l’Employeur vérifie la validité de son permis auprès de la Société de l’assurance automobile du Québec, à l’embauche puis au moins une fois par année. L’Employé(e) doit aviser l’Employeur immédiatement de toute suspension, révocation ou restriction de son permis, ainsi que de toute infraction entraînant des points d’inaptitude. Le défaut de détenir un permis valide rend l’Employé(e) inapte à occuper le poste.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de jour, tôt le matin et de fin de semaine, ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) respecte le Code de la sécurité routière, porte sa ceinture de sécurité et n’utilise pas d’appareil électronique portatif en conduisant. Il ou elle n’utilise le véhicule de l’Employeur qu’aux fins de son travail. Les contraventions découlant de la conduite de l’Employé(e) sont à sa charge, dans la mesure permise par la loi. L’Employé(e) applique les techniques de manutention sécuritaire des charges.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$),
  (3, 'Plongeur', 'Contrat — Plongeur / plongeuse', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
PLONGEUR / PLONGEUSE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) laver, assainir et ranger la vaisselle, les ustensiles, les plaques, les moules, les bacs et les petits équipements de production;
b) nettoyer et assainir les aires de production, les aires de lavage, les planchers et les chambres froides selon le programme d’entretien de l’Employeur;
c) préparer les solutions de nettoyage et d’assainissement selon les dosages prescrits;
d) gérer les déchets, les matières recyclables et les matières compostables;
e) recevoir, vérifier et ranger certaines livraisons de marchandises;
f) prêter main-forte à la production pour des tâches simples, au besoin.
3.2 Aucun diplôme particulier n’est exigé. L’Employeur offre la formation nécessaire à l’utilisation sécuritaire des équipements et des produits.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de jour, de soir et de fin de semaine, ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) utilise les produits d’entretien conformément à leurs étiquettes et à leurs fiches de données de sécurité (SIMDUT 2015), ne mélange jamais deux produits et porte en tout temps l’équipement de protection fourni (gants, tablier imperméable, lunettes au besoin) ainsi que des chaussures antidérapantes fermées. Il ou elle signale immédiatement tout plancher glissant, bris d’équipement ou blessure.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$),
  (4, 'Pâtissier', 'Contrat — Pâtissier / pâtissière', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
PÂTISSIER / PÂTISSIÈRE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) préparer les pâtes, crèmes, mousses, glaçages, garnitures et viennoiseries selon les recettes et les fiches techniques de l’Employeur, sans les modifier sans autorisation;
b) cuire, monter, glacer et décorer les gâteaux, entremets, tartes et pâtisseries selon les standards de qualité et de présentation de l’Employeur;
c) réaliser les commandes spéciales, notamment les gâteaux personnalisés, dans les délais convenus;
d) planifier sa production quotidienne en fonction des quantités demandées et réduire les pertes;
e) peser les ingrédients avec précision, contrôler la qualité des produits et consigner les données de production requises;
f) étiqueter les produits (date de fabrication, ingrédients, allergènes) et assurer la rotation des stocks;
g) signaler les besoins de matières premières et participer à la réception des marchandises;
h) entretenir et assainir son poste de travail et les équipements utilisés;
i) collaborer à la formation des aides-pâtissiers et des nouveaux employés, au besoin.
3.2 L’Employé(e) déclare détenir la formation ou l’expérience en pâtisserie indiquée lors de son embauche et s’engage à suivre toute formation en hygiène et salubrité alimentaires requise par l’Employeur ou par la réglementation.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de jour, tôt le matin, de fin de semaine et, lors des périodes de forte production, de soir, ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) respecte les consignes d’utilisation sécuritaire des batteurs, laminoirs, fours et autres équipements, n’en retire jamais les dispositifs de protection, porte les gants de protection thermique fournis et des chaussures antidérapantes fermées.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$),
  (5, 'Chocolatier', 'Contrat — Chocolatier / chocolatière', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
CHOCOLATIER / CHOCOLATIÈRE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) tempérer le chocolat manuellement ou à la machine selon les courbes de température prescrites;
b) produire les bonbons, ganaches, pralinés, moulages, tablettes et pièces saisonnières selon les recettes et les fiches techniques de l’Employeur, sans les modifier sans autorisation;
c) contrôler la température et l’humidité des aires de production et d’entreposage et consigner les relevés;
d) contrôler la qualité (brillance, cassure, cristallisation, poids) et retirer les produits non conformes;
e) emballer, peser et étiqueter les produits, incluant la liste des ingrédients et la mention des allergènes;
f) assurer la rotation des stocks et la conservation adéquate des matières premières;
g) entretenir et assainir l’atelier, les moules et les équipements.
3.2 L’Employé(e) déclare détenir la formation ou l’expérience en chocolaterie indiquée lors de son embauche et s’engage à suivre toute formation en hygiène et salubrité alimentaires requise par l’Employeur ou par la réglementation.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de jour et de fin de semaine, avec des heures prolongées lors des périodes de forte production (Noël, Saint-Valentin, Pâques), ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) respecte les consignes d’utilisation sécuritaire des tempéreuses, enrobeuses, fondoirs et autres équipements, et porte l’équipement de protection fourni. Compte tenu de la présence de noix, d’arachides et de lait dans l’atelier, il ou elle applique rigoureusement les mesures de prévention de la contamination croisée.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$),
  (6, 'Boulanger', 'Contrat — Boulanger / boulangère', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
BOULANGER / BOULANGÈRE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) peser les ingrédients, pétrir, diviser, façonner et cuire les pains et les viennoiseries selon les recettes et les fiches techniques de l’Employeur, sans les modifier sans autorisation;
b) entretenir et rafraîchir les levains et gérer les temps de pointage, de fermentation et d’apprêt;
c) planifier la production quotidienne selon les commandes et les besoins des points de vente;
d) contrôler la qualité des produits (cuisson, volume, apparence, goût) et retirer les produits non conformes;
e) étiqueter les produits et assurer la rotation des stocks et des matières premières;
f) entretenir et assainir les pétrins, diviseuses, façonneuses, chambres de pousse, fours et le fournil;
g) collaborer à la formation des aides-boulangers et des nouveaux employés, au besoin.
3.2 L’Employé(e) déclare détenir la formation ou l’expérience en boulangerie indiquée lors de son embauche et s’engage à suivre toute formation en hygiène et salubrité alimentaires requise par l’Employeur ou par la réglementation.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de nuit, très tôt le matin et de fin de semaine, compte tenu de la nature de la production boulangère, ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) respecte les consignes d’utilisation sécuritaire des pétrins, diviseuses, façonneuses et fours, n’introduit jamais la main dans un équipement en marche, n’en retire jamais les dispositifs de protection et applique la procédure de cadenassage lors du nettoyage. Il ou elle porte les gants de protection thermique fournis et des chaussures antidérapantes fermées, et applique les mesures de réduction de l’exposition aux poussières de farine.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$),
  (7, 'Cuisinier', 'Contrat — Cuisinier / cuisinière', $tpl$CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE
CUISINIER / CUISINIÈRE

ENTRE
{{entreprise}}, ayant son principal établissement au {{adresse_entreprise}}, représentée aux fins des présentes par {{representant}}, {{titre_representant}}, dûment autorisé(e),
(ci-après l’« Employeur »)

ET
{{prenom}} {{nom}}, domicilié(e) au {{adresse_employe}},
(ci-après l’« Employé(e) »)

(l’Employeur et l’Employé(e) étant collectivement désignés les « Parties »)

PRÉAMBULE
ATTENDU QUE l’Employeur exploite une entreprise de boulangerie, de pâtisserie et de chocolaterie artisanales dont les recettes, le savoir-faire et les procédés de fabrication, développés au fil des années, constituent des actifs essentiels;
ATTENDU QUE l’Employeur désire retenir les services de l’Employé(e) et que l’Employé(e) désire fournir ses services à l’Employeur aux conditions prévues au présent contrat;
LES PARTIES CONVIENNENT DE CE QUI SUIT :

1. OBJET ET DURÉE
1.1 L’Employeur engage l’Employé(e) pour une durée indéterminée à compter du {{date_debut}} (la « Date d’entrée en fonction »).
1.2 Le préambule et le cahier de l’employé en vigueur font partie intégrante du présent contrat. En cas de divergence, le présent contrat a préséance sur le cahier de l’employé.

2. POSTE ET LIEU DE TRAVAIL
2.1 L’Employé(e) occupe le poste de {{poste}}. Il ou elle relève de la direction ou de toute personne désignée par celle-ci.
2.2 L’Employé(e) exerce ses fonctions principalement {{lieu}}. Selon les besoins de l’entreprise, l’Employeur peut lui demander de travailler dans l’un ou l’autre de ses établissements de Laval et de Montréal.

3. FONCTIONS ET EXIGENCES DU POSTE
3.1 Les principales fonctions de l’Employé(e) sont les suivantes :
a) préparer les soupes, sandwichs, salades, quiches, plats cuisinés et autres produits prêts-à-manger selon les recettes et les fiches techniques de l’Employeur, sans les modifier sans autorisation;
b) respecter et consigner les températures de cuisson, de refroidissement, de réchauffage et de conservation;
c) emballer et étiqueter les produits (date de fabrication, date limite, ingrédients, allergènes);
d) assurer la rotation des stocks et réduire les pertes;
e) participer à la planification de la production et à la réception des marchandises;
f) entretenir et assainir la cuisine, les équipements et les chambres froides.
3.2 L’Employé(e) déclare détenir la formation ou l’expérience en cuisine indiquée lors de son embauche et s’engage à suivre toute formation en hygiène et salubrité alimentaires requise par l’Employeur ou par la réglementation.
3.3 L’Employé(e) accomplit toute autre tâche connexe raisonnable, compatible avec ses compétences. L’Employeur peut mettre à jour la description des tâches selon l’évolution de ses activités, sans que cela constitue une modification substantielle du présent contrat.

4. PÉRIODE DE PROBATION
4.1 Les {{essai}} suivant la Date d’entrée en fonction constituent une période de probation permettant à l’Employeur d’évaluer les compétences, le rendement et le comportement de l’Employé(e).
4.2 Conformément à la Loi sur les normes du travail (la « LNT »), aucun avis de cessation d’emploi n’est requis pendant les trois (3) premiers mois de service continu. Au-delà de cette période, les avis prévus à l’article 14 s’appliquent.

5. HORAIRE ET TEMPS DE TRAVAIL
5.1 L’Employé(e) est embauché(e) à {{statut}}. La semaine normale de travail est d’environ {{heures}} heures; ce nombre peut varier selon les besoins de l’entreprise et les saisons.
5.2 L’horaire est établi par l’Employeur et communiqué à l’avance par la plateforme de l’entreprise. Il peut comprendre des quarts de jour, tôt le matin et de fin de semaine, ainsi que des jours fériés, notamment lors des périodes de forte affluence (Noël, jour de l’An, Saint-Valentin, Pâques, fête des Mères).
5.3 L’Employé(e) bénéficie des périodes de repas et de repos prévues par la LNT. Toute heure supplémentaire doit être autorisée au préalable par la direction.
5.4 L’Employé(e) enregistre ses heures d’arrivée et de départ au moyen du système de pointage de l’Employeur. Le fait de pointer pour une autre personne, ou de demander à une autre personne de pointer pour soi, constitue une faute grave.

6. RÉMUNÉRATION
6.1 L’Employé(e) reçoit un salaire horaire brut de {{taux}}.
6.2 Le salaire est versé aux deux (2) semaines par dépôt direct, déduction faite des retenues prévues par la loi et de celles autorisées par écrit par l’Employé(e).
6.3 Les heures travaillées au-delà de quarante (40) heures par semaine sont rémunérées au taux majoré de cinquante pour cent (50 %) ou, à la demande de l’Employé(e) et avec l’accord de l’Employeur, remplacées par un congé d’une durée équivalente majorée de 50 %, conformément à la LNT.
6.4 Le salaire est révisé une fois par année, à la date anniversaire d’embauche. La révision tient compte notamment du rendement de l’Employé(e) et de la situation de l’entreprise; elle n’entraîne pas obligatoirement une augmentation.

7. AVANTAGES ET UNIFORMES
7.1 L’Employé(e) bénéficie des avantages décrits au cahier de l’employé, notamment le rabais employé et le repas offert pour certains quarts. Ces avantages sont accordés à la discrétion de l’Employeur, qui peut les modifier sur préavis raisonnable.
7.2 L’Employeur fournit les uniformes, tabliers et couvre-chefs requis. L’Employé(e) en assure l’entretien et les restitue à la fin de son emploi.

8. VACANCES, JOURS FÉRIÉS ET ABSENCES
8.1 L’Employé(e) a droit aux vacances annuelles et à l’indemnité afférente prévues par la LNT, calculées sur une année de référence s’étendant du 1er mai au 30 avril. À titre indicatif, l’Employé(e) a droit à deux (2) semaines de vacances après un (1) an de service continu (indemnité de 4 %) et à trois (3) semaines après trois (3) ans de service continu (indemnité de 6 %).
8.2 Les demandes de vacances sont faites sur la plateforme de l’entreprise, dans les délais prévus au cahier de l’employé. L’Employeur fixe les dates de vacances en tenant compte des préférences de l’Employé(e), de l’ancienneté et des besoins de l’entreprise. Sauf entente, aucune vacance n’est accordée du 15 décembre au 2 janvier.
8.3 L’Employé(e) bénéficie des jours fériés, chômés et payés prévus par la LNT et par la Loi sur la fête nationale.
8.4 L’Employé(e) peut s’absenter pour cause de maladie ou pour des obligations familiales conformément à la LNT. Les deux (2) premières journées d’absence prises annuellement sont rémunérées lorsque l’Employé(e) justifie de trois (3) mois de service continu. L’Employé(e) avise l’Employeur de son absence le plus tôt possible et, sauf impossibilité, au moins deux (2) heures avant le début de son quart.

9. OBLIGATIONS GÉNÉRALES DE L’EMPLOYÉ(E)
9.1 L’Employé(e) exécute son travail avec prudence, diligence, honnêteté et loyauté, conformément à l’article 2088 du Code civil du Québec.
9.2 L’Employé(e) respecte les politiques, procédures et directives de l’Employeur, notamment celles du cahier de l’employé, ainsi que les normes de qualité et de présentation des produits.
9.3 Pendant la durée de son emploi, l’Employé(e) ne peut, sans le consentement écrit de l’Employeur, travailler pour une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur concurrente, ni exploiter une telle entreprise, ni produire pour la vente des produits semblables à ceux de l’Employeur.

10. SANTÉ, SÉCURITÉ ET SALUBRITÉ
10.1 L’Employé(e) se conforme à la Loi sur la santé et la sécurité du travail, porte l’équipement de protection fourni et signale sans délai à son supérieur tout accident, toute blessure, tout incident ou toute situation dangereuse.
10.2 L’Employé(e) respecte les consignes d’utilisation sécuritaire des couteaux, trancheuses, robots et équipements de cuisson, n’en retire jamais les dispositifs de protection, utilise les gants anti-coupure fournis pour la trancheuse et porte des chaussures antidérapantes fermées.
10.3 L’Employé(e) respecte les règles d’hygiène et de salubrité prévues par la Loi sur les produits alimentaires et ses règlements : lavage des mains, port du couvre-chef, absence de bijoux et de vernis à ongles en production, et respect des températures de conservation.
10.4 L’Employé(e) qui présente des symptômes d’une maladie transmissible par les aliments (notamment vomissements, diarrhée, fièvre ou infection cutanée aux mains) en avise son supérieur avant le début de son quart et s’abstient de manipuler des aliments jusqu’à la disparition des symptômes.
10.5 L’Employé(e) applique rigoureusement les mesures de prévention de la contamination croisée par les allergènes et ne modifie jamais un ingrédient, une recette ou une étiquette sans autorisation.

11. CONFIDENTIALITÉ ET PROTECTION DES RECETTES
11.1 Informations confidentielles. Constitue une « Information confidentielle » toute information non publique concernant l’Employeur, sous quelque forme que ce soit (écrite, verbale, électronique, visuelle ou autre), dont l’Employé(e) prend connaissance dans le cadre de son emploi, notamment :
a) les recettes, formules, fiches techniques, proportions et grammages, la liste des ingrédients et des fournisseurs, les températures, les temps de pétrissage, de fermentation, de cuisson et de cristallisation, les techniques de tempérage, de montage et de décoration, ainsi que les méthodes de production, d’emballage et de conservation de l’Employeur (les « Recettes et procédés »);
b) les produits en développement, les créations saisonnières et les collaborations à venir;
c) les prix coûtants, les marges, les fournisseurs et les conditions négociées avec eux;
d) l’identité et les coordonnées des clients, notamment les clients d’affaires et les clients de commandes spéciales;
e) les chiffres de ventes, les informations financières et les stratégies commerciales;
f) les renseignements personnels concernant les employés et les clients de l’Employeur.
11.2 Exclusions. Ne constituent pas des Informations confidentielles : a) l’information qui est ou devient publique sans faute de l’Employé(e); b) l’information que l’Employé(e) connaissait avant son embauche, ce qu’il ou elle doit démontrer par écrit; c) les connaissances, habiletés et techniques générales du métier que l’Employé(e) possédait déjà ou a acquises au cours de sa carrière. Les Recettes et procédés propres à l’Employeur demeurent toutefois protégés, même lorsqu’ils mettent en œuvre des techniques générales du métier.
11.3 Engagements. L’Employé(e) s’engage à :
a) ne pas communiquer d’Informations confidentielles à quiconque, sauf aux employés de l’Employeur qui ont besoin de les connaître pour exercer leurs fonctions;
b) ne pas utiliser les Informations confidentielles à d’autres fins que l’exécution de son travail pour l’Employeur, notamment pour son propre compte ou celui d’un tiers;
c) ne pas copier, photographier, filmer, enregistrer, transcrire ou transmettre les Recettes et procédés, les fiches techniques, les aires de production ou les produits en développement, notamment sur un appareil personnel ou sur les réseaux sociaux, sans l’autorisation écrite préalable de l’Employeur;
d) ne retirer aucun document, fichier ou support contenant des Informations confidentielles des lieux de travail ou des systèmes de l’Employeur;
e) respecter les mesures de protection mises en place par l’Employeur et l’aviser sans délai de toute divulgation, perte ou utilisation non autorisée dont il ou elle a connaissance.
11.4 Durée. Les obligations du présent article s’appliquent pendant toute la durée de l’emploi et après sa fin, quelle qu’en soit la cause : a) en tout temps, pour les Recettes et procédés et les autres secrets commerciaux, tant qu’ils conservent leur caractère confidentiel; b) pendant deux (2) ans après la fin de l’emploi, pour les autres Informations confidentielles; c) sans limite de temps, pour les renseignements personnels.
11.5 Propriété des créations. Toute recette, tout produit, procédé, amélioration, décor, design, nom de produit, photographie ou autre création conçu ou développé par l’Employé(e), seul(e) ou avec d’autres, dans l’exécution de ses fonctions ou au moyen des ressources, ingrédients ou installations de l’Employeur, appartient exclusivement à l’Employeur dès sa création. Dans la mesure nécessaire, l’Employé(e) cède à l’Employeur tous ses droits de propriété intellectuelle sur ces créations, y compris ses droits d’auteur, sans autre contrepartie que la rémunération prévue au présent contrat, et renonce à l’exercice de ses droits moraux à leur égard dans la mesure permise par la loi.
11.6 Restitution. À la fin de son emploi, ou plus tôt à la demande de l’Employeur, l’Employé(e) remet à l’Employeur, dans un délai de cinq (5) jours ouvrables, tous les documents, fiches, fichiers, clés, cartes d’accès, uniformes et autres biens de l’Employeur en sa possession, détruit toute copie électronique des Informations confidentielles, y compris celles qui se trouvent sur ses appareils personnels, et le confirme par écrit sur demande.
11.7 Divulgation permise. Rien dans le présent article n’empêche l’Employé(e) de communiquer une information exigée par la loi ou par un tribunal, de signaler une contravention à la loi à une autorité compétente ou de collaborer à une enquête menée par une telle autorité. Lorsque la loi le permet, l’Employé(e) avise l’Employeur de toute demande de divulgation.
11.8 Recours. L’Employé(e) reconnaît que les Recettes et procédés ont une valeur commerciale importante, que l’Employeur prend des mesures raisonnables pour en préserver le secret et qu’un manquement au présent article pourrait causer à l’Employeur un préjudice sérieux et difficilement réparable. En cas de manquement ou de menace de manquement, l’Employeur pourra, en plus de réclamer des dommages-intérêts, demander une injonction aux tribunaux. Un manquement au présent article peut aussi constituer un motif sérieux de congédiement.

12. NON-SOLLICITATION
12.1 Pendant la durée de son emploi et pendant douze (12) mois après la fin de celui-ci, l’Employé(e) s’engage à ne pas solliciter ni inciter, directement ou indirectement, un employé de l’Employeur à quitter son emploi pour travailler pour une entreprise concurrente.
12.2 Pendant la même période, l’Employé(e) s’engage à ne pas solliciter, pour le compte d’une entreprise de boulangerie, de pâtisserie, de chocolaterie ou de traiteur, les clients d’affaires ou les clients de commandes spéciales de l’Employeur avec lesquels il ou elle a eu des contacts au cours des douze (12) mois précédant la fin de son emploi.

13. MESURES DISCIPLINAIRES
13.1 Un manquement aux obligations de l’Employé(e) peut entraîner des mesures disciplinaires, appliquées de façon progressive selon la gravité et la fréquence des manquements : avertissement verbal consigné, avertissement écrit, suspension et congédiement. Une faute grave peut entraîner directement une mesure plus sévère, y compris le congédiement.
13.2 Les avertissements sont transmis à l’Employé(e) et déposés à son dossier par la plateforme de l’entreprise. L’Employé(e) en confirme la réception, ce qui n’emporte pas son accord, et peut y joindre ses commentaires.

14. FIN D’EMPLOI
14.1 Après trois (3) mois de service continu, l’Employeur qui met fin à l’emploi donne à l’Employé(e) l’avis écrit prévu à l’article 82 de la LNT, soit une (1) semaine si le service continu est de moins d’un (1) an, deux (2) semaines s’il est d’un (1) an à cinq (5) ans, quatre (4) semaines s’il est de cinq (5) à dix (10) ans et huit (8) semaines s’il est de dix (10) ans ou plus, ou lui verse l’indemnité compensatrice équivalente.
14.2 L’Employeur peut mettre fin à l’emploi sans préavis ni indemnité pour un motif sérieux, conformément à l’article 2094 du Code civil du Québec, ou en cas de faute grave au sens de la LNT.
14.3 L’Employé(e) qui désire quitter son emploi donne à l’Employeur un préavis écrit d’au moins deux (2) semaines, conformément à l’article 2091 du Code civil du Québec.
14.4 À la fin de l’emploi, l’Employeur verse à l’Employé(e) le salaire dû et l’indemnité de vacances accumulée, et lui remet les documents prévus par la loi. Les articles 11, 12 et 15 demeurent en vigueur après la fin de l’emploi.

15. RENSEIGNEMENTS PERSONNELS
15.1 L’Employeur recueille, utilise, conserve et communique les renseignements personnels de l’Employé(e) uniquement aux fins de la gestion de la relation d’emploi (notamment la paie, les obligations fiscales, la gestion des horaires et des congés, et les communications en cas d’urgence), conformément à la Loi sur la protection des renseignements personnels dans le secteur privé.
15.2 Le numéro d’assurance sociale, le spécimen de chèque et, le cas échéant, le permis de conduire sont transmis par la section sécurisée et chiffrée de la plateforme de l’entreprise; seule la personne autorisée par l’Employeur y a accès.
15.3 L’Employé(e) peut demander l’accès à ses renseignements personnels ou leur rectification en s’adressant à la personne responsable de la protection des renseignements personnels de l’Employeur. Les renseignements sont détruits de façon sécuritaire lorsqu’ils ne sont plus nécessaires aux fins pour lesquelles ils ont été recueillis, sous réserve des délais de conservation prévus par la loi.

16. COMMUNICATIONS ÉLECTRONIQUES ET SIGNATURE
16.1 L’Employé(e) accepte que les horaires, avis, avertissements et autres documents relatifs à son emploi lui soient transmis par la plateforme de l’entreprise, et s’engage à la consulter régulièrement.
16.2 Les Parties conviennent que leur signature électronique apposée sur le présent contrat a la même valeur qu’une signature manuscrite, conformément à la Loi concernant le cadre juridique des technologies de l’information. Une copie signée demeure accessible à l’Employé(e) sur la plateforme.

17. DISPOSITIONS GÉNÉRALES
17.1 Intégralité. Le présent contrat et le cahier de l’employé constituent l’entente complète entre les Parties et remplacent toute entente, offre ou déclaration antérieure, verbale ou écrite, portant sur le même objet.
17.2 Modification. Toute modification du présent contrat doit être constatée par écrit et acceptée par les deux Parties, sous réserve du droit de l’Employeur de mettre à jour ses politiques et le cahier de l’employé.
17.3 Divisibilité. Si une disposition du présent contrat est jugée nulle ou inapplicable, elle est réputée retranchée et les autres dispositions demeurent en vigueur.
17.4 Normes minimales. Aucune disposition du présent contrat ne peut avoir pour effet d’accorder à l’Employé(e) des conditions inférieures à celles prévues par la LNT; le cas échéant, la norme prévue par la loi s’applique.
17.5 Droit applicable. Le présent contrat est régi par les lois en vigueur au Québec.
17.6 Langue. Le présent contrat est rédigé en français.
17.7 Déclaration. L’Employé(e) reconnaît avoir lu et compris le présent contrat, avoir eu l’occasion de poser ses questions et de consulter un conseiller de son choix avant de le signer, et l’avoir signé librement.

EN FOI DE QUOI, les Parties ont signé électroniquement le présent contrat à {{ville}}, à la date indiquée sous leur signature respective.

Contrat préparé le {{date_contrat}}.$tpl$)
) v(position, poste, title, body)
where not exists (select 1 from public.contract_templates);

-- Fin de l'étape 2.
