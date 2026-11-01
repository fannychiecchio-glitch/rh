-- =====================================================================
-- Donner le rôle d'administratrice à TON compte.
-- 1) Crée d'abord ton compte dans Supabase : Authentication → Users → Add user → Create new user
--    (ton courriel, un mot de passe solide, et coche « Auto Confirm User »).
-- 2) Remplace l'adresse ci-dessous par la tienne, puis clique sur Run.
-- =====================================================================

insert into public.profiles (id, role)
select id, 'admin' from auth.users where email = lower('REMPLACE-PAR-TON-COURRIEL@exemple.com')
on conflict (id) do update set role = 'admin';

-- Vérification : cette requête doit afficher ton courriel avec le rôle admin.
select u.email, p.role from public.profiles p join auth.users u on u.id = p.id;
