# Espace équipe — Marius & Fanny

Plateforme RH des employés de Marius & Fanny (pâtisserie-boulangerie, Laval et Montréal).

- **Site** : fichiers `index.html`, `style.css`, `app.js`, `config.js`, publiés avec GitHub Pages.
- **Données et connexions** : Supabase (région Canada Central). Toutes les règles d'accès sont appliquées par la base de données (sécurité ligne par ligne). Ce dépôt ne contient aucune donnée d'employé ni aucune clé secrète.
- **Courriels** : invitations et mots de passe envoyés par Supabase (SMTP personnalisé); avis de la plateforme envoyés par la fonction `notify` (SMTP, port 465).

## Mise en place (étape 1)

1. **Base de données** — Supabase → SQL Editor → New query : coller `supabase/01-etape1.sql`, puis Run.
2. **Compte administrateur** — Authentication → Users → Add user → Create new user (cocher *Auto Confirm User*). Puis coller `supabase/02-administratrice.sql` en y mettant le courriel, et Run.
3. **Réglages de connexion** — Authentication :
   - *Sign In / Providers → Email* : désactiver **Allow new users to sign up** (seules les invitations créent des comptes).
   - *URL Configuration* : **Site URL** = adresse du site ; ajouter la même adresse dans **Redirect URLs**.
4. **Courriels** — Authentication → Emails → SMTP Settings → activer *Custom SMTP* avec les identifiants SMTP de Brevo (`smtp-relay.brevo.com`, port 587).
5. **Fonction d'invitation** — Edge Functions → Deploy a new function → Via Editor : nom `invite-employee`, coller `supabase/functions/invite-employee/index.ts`, Deploy. Ajouter le secret `SITE_URL` (adresse du site).
6. **Publication** — GitHub → Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

## Mise en place (étape 2)

1. **Base de données** — SQL Editor → New query : coller `supabase/03-etape2.sql`, puis Run.
2. **Fonction des avis** — Edge Functions → Deploy a new function → Via Editor : nom `notify`, coller `supabase/functions/notify/index.ts`, Deploy (garder *Verify JWT* activé).
3. **Secrets** (Edge Functions → Secrets) : `SMTP_HOST` (ex. `smtp.gmail.com`), `SMTP_USER` (adresse complète), `SMTP_PASS` (mot de passe d'application), `SMTP_FROM` (adresse d'envoi, facultatif). Port 465 par défaut (les ports 25 et 587 sont bloqués par Supabase).
4. **Réglages dans la plateforme** — Employés → Contrats : renseignements de l'employeur et adresses des magasins.

## Mise en place (étape 3)

1. **Base de données** — SQL Editor → New query : coller `supabase/04-etape3.sql`, puis Run.
2. Rien d'autre : la page **Paye et pourboire** apparaît dans l'administration. Ces données ne sont jamais visibles par les employés.

## Mise en place (étape 4)

1. **Base de données** — SQL Editor → New query : coller `supabase/05-etape4.sql`, puis Run.
2. **Fonction des avis** — Edge Functions → `notify` → Code : remplacer par la nouvelle version de `supabase/functions/notify/index.ts`, puis Deploy.
3. **Coffre** — Employés → Coffre : créer le code du coffre (12 caractères ou plus). Ce code ne peut pas être récupéré.

## Documents au dossier

1. **Base de données** — SQL Editor → New query : coller `supabase/06-documents.sql`, puis Run. Crée l'espace de stockage privé `docs` et ses règles d'accès.

## Sécurité

- Le compte administrateur exige la validation en deux étapes (TOTP) : sans elle, la base refuse l'accès aux données d'administration.
- La clé `sb_publishable_…` dans `config.js` est publique par conception. Ne jamais mettre la clé `service_role` / `secret` dans ce dépôt.
- Coffre : le NAS, le spécimen de chèque et le permis sont chiffrés dans le navigateur de l'employé (RSA-OAEP 3072 + AES-GCM 256). La clé privée est chiffrée par le code du coffre (PBKDF2, 600 000 itérations) et n'est jamais envoyée en clair.
