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

### 1 bis. Migration `motivation_reasons` (D-046, même méthode)

À coller **avant** de publier un client qui contient les motivations multiples. Sans elle, un client à jour fonctionne mais ses motivations choisies ne se synchronisent pas (l'envoi de la colonne échouerait).

1. SQL Editor → New query → coller tout `supabase/migrations/20261025000001_motivation_reasons.sql` → Run. Elle est idempotente : la relancer ne change rien.
2. Vérifier (lecture seule) :

```sql
-- La colonne existe, liste vide par défaut : attendu text[] / '{}'::text[]
select data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'motivations' and column_name = 'reasons';

-- La contrainte de valeurs connues est là : attendu 1 ligne
select conname from pg_constraint
where conrelid = 'public.motivations'::regclass and conname = 'motivations_reasons_known';

-- RLS toujours active sur motivations : attendu true
select relrowsecurity from pg_class where oid = 'public.motivations'::regclass;
```

### 1 ter. Migration `calendar_feeds` (D-049, même méthode)

Table du lien iCal (lien scellé, créneaux occupés seulement). Idempotente.

1. SQL Editor → New query → coller tout `supabase/migrations/20261026000001_calendar_feeds.sql` → Run.
2. Vérifier (lecture seule) :

```sql
-- RLS active : attendu true
select relrowsecurity from pg_class where oid = 'public.calendar_feeds'::regclass;

-- 4 policies propriétaire : attendu delete / insert / select / update
select policyname, cmd from pg_policies where tablename = 'calendar_feeds' order by policyname;

-- anon n'a aucun droit : attendu 0 ligne pour anon
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'calendar_feeds' and grantee = 'anon';

-- Aucune colonne de titre ou de détail d'événement : attendu 0 ligne
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'calendar_feeds'
  and column_name in ('title', 'summary', 'description', 'location', 'url');
```

## 2. Secrets des Edge Functions (`analyze-meal`, `calendar-feed`)

```bash
npx supabase@latest login
npx supabase@latest link --project-ref krcqdrrfnvfpvczxwrmt
```

Créer un fichier **hors du dépôt** (par exemple `~/projectyou-fn.env`). `analyze-meal` accepte un fournisseur ou une **liste ordonnée** : le premier qui répond gagne, l'utilisateur ne voit rien si le premier échoue.

**Recommandé, gratuit en secours (D-048)** : OpenAI d'abord, Cloudflare Workers AI ensuite (offre gratuite, 10 000 neurons par jour, aucun paiement) :

```
MEAL_VISION_PROVIDER=openai,cloudflare
MEAL_VISION_MODEL=gpt-6-luna
OPENAI_API_KEY=<ta clé de projet OpenAI>
CLOUDFLARE_ACCOUNT_ID=<identifiant du compte Cloudflare>
CLOUDFLARE_AI_TOKEN=<jeton API avec la permission Workers AI>
```

**Tout gratuit** (aucune clé OpenAI) : `MEAL_VISION_PROVIDER=cloudflare` avec seulement les deux secrets `CLOUDFLARE_*`. Modèle par défaut `@cf/mistralai/mistral-small-3.1-24b-instruct` ; pour en essayer un autre : `MEAL_VISION_CLOUDFLARE_MODEL=@cf/…`.

Jeton Cloudflare : dash.cloudflare.com → My Profile → API Tokens → Create Token → modèle « Workers AI » (lecture + édition), limité à ton compte. L'identifiant du compte est dans Workers & Pages → colonne de droite (Account ID).

Comparer les modèles gratuits sur tes vraies photos avant de choisir (rien n'est enregistré, le jeton n'est jamais affiché) :

```bash
CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_AI_TOKEN=… npx tsx scripts/vision/compare-cloudflare.ts ~/Images/repas1.jpg ~/Images/repas2.jpg
```

Autres possibilités, un seul fournisseur :

OpenAI (recommandé : `gpt-6-luna`, voir les modèles compatibles dans `docs/MEAL_PHOTO_ANALYSIS.md`) :

```
MEAL_VISION_PROVIDER=openai
MEAL_VISION_MODEL=gpt-6-luna
OPENAI_API_KEY=<ta clé de projet OpenAI>
```

ou Anthropic :

```
MEAL_VISION_PROVIDER=anthropic
MEAL_VISION_MODEL=<identifiant du modèle de vision choisi>
ANTHROPIC_API_KEY=<ta clé>
```

Lien iCal (D-049) : une clé de chiffrement, générée sur ta machine, ajoutée au même fichier :

```bash
echo "CALENDAR_FEED_KEY=$(openssl rand -base64 32)" >> ~/projectyou-fn.env
```

Garde-la : si elle change, les liens iCal déjà enregistrés ne peuvent plus être lus (chaque utilisateur devra recoller son lien).

Lieux proches (D-051) : une clé **Geoapify** gratuite (plan Free, 3 000 crédits par jour, sans carte bancaire). Sur https://myprojects.geoapify.com : créer un compte, un projet « Project You », copier la clé API du projet. Puis, dans le même fichier :

```bash
read -rs GEO && echo "GEOAPIFY_API_KEY=$GEO" >> ~/projectyou-fn.env && unset GEO   # coller la clé, rien ne s'affiche
```

Sans `GEOAPIFY_API_KEY`, `places-nearby` utilise OpenStreetMap (Overpass) seul, comme avant. Aucune clé Google, aucune facturation à activer. Liste des secrets attendus : `supabase/functions/.env.example`.

Côté OpenAI : une clé de **projet** dédiée à Project You, avec une limite de dépense mensuelle dans le tableau de bord OpenAI (Limits). Aucun en-tête d'organisation n'est nécessaire.

```bash
npx supabase@latest secrets set --env-file ~/projectyou-fn.env
rm ~/projectyou-fn.env
npx supabase@latest secrets list   # les noms apparaissent, jamais les valeurs
```

Pour changer de fournisseur plus tard : reposer ces 3 secrets, retirer l'ancienne clé (`npx supabase@latest secrets unset ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`), puis relancer le déploiement de l'étape 3 : le fournisseur est lu au démarrage de la fonction, et un redéploiement garantit que toutes les instances lisent les nouveaux secrets. Aucune nouvelle version de l'app.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés par Supabase : rien à poser.

## 3. Déployer les fonctions

```bash
npx supabase@latest functions deploy analyze-meal --project-ref krcqdrrfnvfpvczxwrmt
npx supabase@latest functions deploy places-nearby --project-ref krcqdrrfnvfpvczxwrmt
npx supabase@latest functions deploy calendar-feed --project-ref krcqdrrfnvfpvczxwrmt
npx supabase@latest functions list --project-ref krcqdrrfnvfpvczxwrmt   # les 4 ACTIVE avec delete-account
```

Ne passe jamais `--no-verify-jwt`. Contrôle : un appel sans connexion doit être refusé (attendu `401` pour chacune).

```bash
for f in analyze-meal places-nearby calendar-feed; do
  printf "%s " "$f"; curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://krcqdrrfnvfpvczxwrmt.supabase.co/functions/v1/$f"
done
```

**Diagnostic de `analyze-meal`** (sans photo, sans rien envoyer au fournisseur) : un GET avec ton jeton de session répond la version du code déployé, les fournisseurs actifs et les **noms** des secrets manquants. Récupérer le jeton : dans l'app web connectée, outils de développement → Application → Local Storage → clé `sb-krcqdrrfnvfpvczxwrmt-auth-token` → `access_token` (il expire après une heure ; ne le colle nulle part ailleurs).

```bash
read -rs TOKEN   # coller le jeton, rien ne s'affiche
curl -s -H "Authorization: Bearer $TOKEN" https://krcqdrrfnvfpvczxwrmt.supabase.co/functions/v1/analyze-meal; echo
unset TOKEN
```

Attendu : `{"version":"2026-10-26","providers":[{"provider":"openai",…},{"provider":"cloudflare",…}],"missing":[]}`. Une `version` absente ou plus ancienne : la fonction déployée n'est pas la dernière, relancer le déploiement. `missing` non vide : poser ces secrets (étape 2), redéployer.

Puis, dans l'app connectée : Nutrition → ajouter un repas → photo → « Analyser » renvoie un brouillon. C'est le premier appel réel au fournisseur : il n'a pas pu être fait depuis l'environnement de développement.

- Brouillon affiché : vérifier que chaque aliment a ses grammes et que les calories affichées sont celles du catalogue (étiquette « estimation »), pas un chiffre du modèle.
- L'écran dit maintenant **pourquoi** l'analyse n'est pas disponible : fonction non déployée, réglage manquant (avec le nom du secret), fonction qui ne démarre pas, ou mode local. Le GET de diagnostic ci-dessus confirme.
- Tous les fournisseurs ont échoué (502 `analysis_failed`) : l'écran donne la raison (quota ou crédit épuisé, clé refusée, modèle introuvable, limite atteinte, délai dépassé) et propose la composition à la main. Délai : 25 s par fournisseur, 45 s au total.
- Les journaux de la fonction ne contiennent ni la photo, ni la réponse, ni la clé.
- Dans tous ces cas, « Composer mon repas à la main » fonctionne : c'est le repli prévu, pas une panne.

**Contrôle de `calendar-feed`** dans l'app connectée : Calendrier → coller un lien iCal (Google Agenda : Paramètres → ton agenda → « Adresse secrète au format iCal ») → « Tester le lien » (nombre d'événements) → « Utiliser ce calendrier » → Programme : les séances évitent les créneaux occupés. Sans `CALENDAR_FEED_KEY`, l'écran dit « pas encore configuré sur le serveur ».

**Contrôle de `places-nearby`** : d'abord le diagnostic (même jeton que ci-dessus), qui ne renvoie jamais la clé :

```bash
read -rs TOKEN
curl -s -H "Authorization: Bearer $TOKEN" https://krcqdrrfnvfpvczxwrmt.supabase.co/functions/v1/places-nearby; echo
unset TOKEN
```

Attendu avec la clé : `{"version":"2026-10-26.geoapify","providers":["geoapify","overpass"],"geoapifyConfigured":true,"fallback":"overpass"}`. `geoapifyConfigured:false` : secret absent ou fonction pas redéployée depuis.

Puis Lieux → « Chercher autour de moi » : la source sous la liste dit « Powered by Geoapify · © OpenStreetMap contributors ». Service indisponible, trop de demandes ou limite gratuite du jour atteinte : le message le dit, « Réessayer » relance. Mesurer Overpass (le secours) depuis ta connexion (16 requêtes polies, villes fixes, aucune position à toi) :

```bash
node scripts/places/measure-overpass.mjs
```

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
