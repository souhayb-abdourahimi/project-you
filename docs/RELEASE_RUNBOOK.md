# Runbook release : actions manuelles

Ce qu'il faut exécuter soi-même, dans l'ordre, depuis un poste qui atteint `krcqdrrfnvfpvczxwrmt.supabase.co`. Les threads cloud ne l'atteignent pas. La checklist à cocher est `docs/RELEASE_CHECKLIST.md`.

Règles : aucune valeur secrète dans le dépôt, le chat ou l'historique du shell ; rien n'est fusionné avant ton accord.

## 0. Récupérer la branche

```bash
git fetch origin
git checkout claude/w9-checkin-premium
git pull origin claude/w9-checkin-premium
npm ci
npm run check && npm run build:web && npm run test:e2e
```

## 1. Migration `logged_meals` (éditeur SQL, pas `db push`)

Les migrations précédentes ont été appliquées depuis l'éditeur SQL : l'historique de la CLI ne les connaît pas, et `supabase db push` tenterait de tout rejouer depuis `20260930000001_core.sql`. **N'utilise pas `db push`.**

1. Tableau de bord → SQL Editor → New query.
2. Coller tout le fichier `supabase/migrations/20261017000001_logged_meals.sql` → Run (une seule fois).
3. Vérifier (lecture seule) :

```sql
-- RLS active sur logged_meals : attendu true
select relrowsecurity from pg_class where oid = 'public.logged_meals'::regclass;

-- 4 policies : delete / insert / select / update _own
select policyname, cmd from pg_policies where tablename = 'logged_meals' order by policyname;

-- anon n'a aucun droit (0 ligne pour anon)
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'logged_meals' and grantee in ('anon', 'authenticated');

-- Aucune table publique sans RLS : attendu 0 ligne
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

4. Database → Advisors : Security et Performance. Seul avertissement attendu côté sécurité : Leaked Password Protection (étape 4). Ne supprime aucun index « inutilisé ».

## 2. Secrets de `analyze-meal`

```bash
npx supabase@latest login
npx supabase@latest link --project-ref krcqdrrfnvfpvczxwrmt
```

Créer un fichier **hors du dépôt** (par exemple `~/projectyou-fn.env`) :

```
MEAL_VISION_PROVIDER=anthropic
MEAL_VISION_MODEL=<identifiant du modèle de vision choisi>
ANTHROPIC_API_KEY=<ta clé>
```

```bash
npx supabase@latest secrets set --env-file ~/projectyou-fn.env
rm ~/projectyou-fn.env
npx supabase@latest secrets list   # les 3 noms apparaissent, jamais les valeurs
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés par Supabase : rien à poser.

## 3. Déployer `analyze-meal`

```bash
npx supabase@latest functions deploy analyze-meal --project-ref krcqdrrfnvfpvczxwrmt
npx supabase@latest functions list --project-ref krcqdrrfnvfpvczxwrmt   # analyze-meal ACTIVE, delete-account ACTIVE
```

Ne passe pas `--no-verify-jwt`. Contrôle : un appel sans connexion doit être refusé (attendu `401`).

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://krcqdrrfnvfpvczxwrmt.supabase.co/functions/v1/analyze-meal
```

Puis, dans l'app connectée : Nutrition → ajouter un repas → photo → « Analyser » renvoie un brouillon. Si la fonction répond 503 (secrets incomplets), l'app propose « Composer mon repas à la main » : c'est le repli prévu, pas une panne.

## 4. Sécurité Auth (tableau de bord)

Authentication → Sign In / Providers → Email, puis Authentication → URL Configuration :

| Réglage | Valeur |
|---|---|
| Confirm email | activé |
| Minimum password length | 8 (l'app impose déjà 8) |
| Leaked password protection | **activé** (si l'option est grisée, elle demande un plan payant : à décider avant la bêta publique) |
| Site URL | l'URL publique de l'app web, à défaut celle de la page de confirmation |
| Redirect URLs | ajouter `projectyou://**` (schéma de l'app) |

Garder les limites de débit par défaut. Relancer ensuite Advisors → Security : 0 avertissement attendu.

## 5. Tests sur le projet réel

Dans `.env.local` (jamais commité), deux comptes de test **confirmés** :

```
EXPO_PUBLIC_SUPABASE_URL=https://krcqdrrfnvfpvczxwrmt.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clé publishable>
SUPABASE_TEST_EMAIL_A=…
SUPABASE_TEST_PASSWORD_A=…
SUPABASE_TEST_EMAIL_B=…
SUPABASE_TEST_PASSWORD_B=…
```

```bash
npm run test:live
```

Attendu : tout vert (connexion, sync, isolation A/B, anon refusé).

## 6. Builds sur appareils réels

Le projet a des modules natifs (HealthKit, Health Connect, appareil photo) : Expo Go ne suffit pas, il faut un build de développement. `.env.local` doit exister avant le build.

**iOS** (Mac, Xcode, iPhone branché, équipe Apple Developer avec la capability HealthKit) :

```bash
npx expo prebuild --clean --platform ios
npx expo run:ios --device
```

**Android** (Android Studio, téléphone en débogage USB) :

```bash
npx expo prebuild --clean --platform android
npx expo run:android --device
```

`prebuild` génère `ios/` et `android/` : ne les commite pas. Pour TestFlight / Play interne, il faudra ensuite configurer EAS (`npx eas-cli build:configure`), ce qui n'est pas fait.

## 7. Parcours à dérouler sur chaque téléphone

Cocher les sections 5, 6 et 7 de `docs/RELEASE_CHECKLIST.md` :

- inscription 18+, confirmation de l'e-mail, sync, déconnexion puis reconnexion ;
- séance complète, puis la même hors ligne ;
- repas par photo (accepter, puis refuser la caméra : la galerie et la composition à la main restent) ;
- notifications et heures calmes ;
- santé selon `docs/MOBILE_HEALTH_TEST_PLAN.md` ;
- suppression d'un compte de test (ses photos partent avec lui) ;
- VoiceOver (iOS) et TalkBack (Android) sur Aujourd'hui, Séance, Progrès, Repas ;
- mode sombre, police système au maximum, petit écran.

## 8. Après tout cela

Me redonner : le résultat de `test:live`, les advisors, les cases cochées ou non. La fusion se fait seulement sur ton accord explicite.
