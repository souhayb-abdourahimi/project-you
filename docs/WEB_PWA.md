# Version web installable (PWA) — iPhone sans Mac (D-047)

Project You tourne aussi comme **app web installée sur l'écran d'accueil** d'un iPhone, sans Mac, sans compte Apple Developer, sans App Store. C'est le même code que les apps natives (Expo / React Native Web) : rien n'est dupliqué, les moteurs sont les mêmes, le futur build iOS / Android n'est pas touché (icônes natives, `app.json` ios / android et modules natifs inchangés).

## 1. Ce qui a été ajouté

| Fichier | Rôle |
| --- | --- |
| `public/index.html` | Gabarit HTML de l'export web : `lang="fr"`, `viewport-fit=cover` (zones sûres), balises iOS (`apple-mobile-web-app-*`, icône d'écran d'accueil), `theme-color` clair / sombre, fond sombre avant le premier rendu, champs à 16 px sur iOS (pas de zoom au focus), zoom jamais bloqué. |
| `public/manifest.webmanifest` | Nom **PROJECT YOU**, `display: standalone`, `orientation: portrait`, couleurs, icônes 192 / 512 / maskable / 180. |
| `public/icons/*`, `assets/images/favicon.png` | Icônes web générées par `scripts/pwa/make-icons.py` (courbe de progression blanche sur dégradé bleu de la marque). Les icônes natives ne changent pas. |
| `public/sw.js` | Service worker « coquille d'app » (§ 5). |
| `public/_headers` | En-têtes Cloudflare Pages : cache long des fichiers hachés, `no-cache` pour `index.html` / `sw.js` / manifeste, en-têtes de sécurité. |
| `src/services/web.ts` | Enregistrement du service worker (production web seulement), barres du navigateur et langue du document qui suivent l'app, détection appareil tactile, export de données via la feuille de partage. Ne fait rien en natif. |
| `src/providers/location.web.ts` | Position du navigateur : une seule demande, une seule mesure, erreurs distinctes (refus, délai, indisponible), jamais bloquée sur « Localisation… ». |
| `src/components/navigation/HomeFallbackButton.tsx` | Une page ouverte sans historique (rechargement, app rouverte sur une page) garde un bouton retour vers Aujourd'hui : il n'y a pas de bouton « précédent » dans une app web installée. |
| `scripts/pwa/check-dist.mjs` | Vérifie l'export avant déploiement : fichiers installables présents, **aucun secret serveur** dans les fichiers servis, mode Supabase ou local. |

## 2. Construire

Sur l'ordinateur (Fedora), dans le dossier du projet :

```bash
npm ci
npm run build:pwa     # = expo export --platform web + scripts/pwa/check-dist.mjs → dossier dist/
```

Variables lues **au moment du build** (fichier `.env.local`, jamais commité, ou variables d'environnement) :

| Variable | Valeur | Publique ? |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://krcqdrrfnvfpvczxwrmt.supabase.co` | oui |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clé `sb_publishable_…` (Dashboard → Project Settings → API Keys) | oui, protégée par Auth + RLS |

Rien d'autre. **Jamais** de clé `sb_secret_…`, `service_role`, `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` : elles restent dans les secrets des Edge Functions. Seules les variables `EXPO_PUBLIC_*` entrent dans le bundle, et `check-dist.mjs` fait échouer le build s'il trouve une clé secrète. Sans ces deux variables, l'app se construit en **mode local** (pas de compte, pas d'analyse photo) et le script le signale.

Tester le build en local : `node scripts/serve-dist.mjs` puis http://localhost:8765.

## 3. Héberger gratuitement : Cloudflare Pages

Choix : **Cloudflare Pages, offre gratuite** (HTTPS automatique, bande passante illimitée, usage commercial permis, 500 builds / mois, pas de carte bancaire). Vercel Hobby interdit l'usage commercial ; Netlify gratuit plafonne la bande passante. Aucun réglage payant n'est utilisé.

### Option A (recommandée) : envoi direct depuis Fedora

Un déploiement n'a lieu que quand tu lances la commande : rien ne part tout seul à chaque push.

```bash
# une seule fois : compte Cloudflare gratuit, puis
npx wrangler@4 login
npx wrangler@4 pages project create project-you --production-branch main

# à chaque mise en ligne
npm run deploy:web
# = npm run build:pwa && npx wrangler@4 pages deploy dist --project-name project-you --branch main --commit-dirty=true
```

`--branch main` publie sur l'URL de production `https://project-you.pages.dev` (sans lui, wrangler prend la branche git courante et crée seulement un aperçu). Si le nom `project-you` est déjà pris chez Cloudflare, le projet reçoit un suffixe : l'URL exacte est affichée à la fin de la commande.

### Option B : branchement Git dans le tableau de bord

Workers & Pages → Create → Pages → Connect to Git → dépôt `project-you`.
Build command `npm run build:pwa` · Build output directory `dist` · variables `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `NODE_VERSION=22`.
Attention : chaque push sur la branche de production redéploie le site.

### Ce que Cloudflare fait sans réglage

- HTTPS et certificat automatiques.
- Application monopage : sans `404.html`, Pages renvoie `index.html` pour toute adresse inconnue (`/nutrition`, `/progress`…). Aucun fichier `_redirects` n'est donc nécessaire.
- Compression Brotli du bundle (≈ 3,4 Mo non compressé).

## 4. Supabase : URL de redirection

À faire dans le tableau de bord (Authentication → URL Configuration). **Ne rien retirer** de ce qui existe déjà, ajouter seulement :

| Champ | Valeur |
| --- | --- |
| Redirect URLs | `https://project-you.pages.dev/**` (l'URL de production exacte) |
| Redirect URLs | `https://*.project-you.pages.dev/**` (aperçus, facultatif) |
| Redirect URLs | `http://localhost:8081/**` (expo start --web) et `http://localhost:8765/**` (build local) |
| Redirect URLs | `projectyou://**` (futur natif, s'il n'y est pas déjà) |
| Site URL | conseillé : l'URL de production web (adresse par défaut des e-mails). Si l'ancienne valeur sert encore, la garder dans Redirect URLs. |

Sur le web, l'inscription envoie `emailRedirectTo = <adresse du site>` : le lien de confirmation revient sur le site. Si l'adresse n'est pas dans la liste, Supabase utilise la Site URL (pas d'erreur, mais le lien peut mener ailleurs).

L'Edge Function `analyze-meal` répond déjà au préflight CORS (`Access-Control-Allow-Origin: *`) : l'analyse photo fonctionne depuis le domaine web sans changement.

## 5. Hors ligne : ce qui est mis en cache, et ce qui ne l'est jamais

- **Pages** : réseau d'abord ; hors ligne, la dernière coquille de l'app s'ouvre. L'app affiche alors son propre état hors ligne.
- **Fichiers statiques du même site** (bundle JS haché, images, icônes ; aucune police d'icônes depuis D-048 : les icônes sont des dessins SVG dans le bundle) : cache d'abord, 150 fichiers au plus. Le premier chargement les garde dès que le service worker est actif.
- **Jamais en cache** : Supabase, OpenStreetMap / Overpass, le service d'analyse photo, toute requête non GET, toute réponse d'API. Une erreur réseau arrive donc toujours à l'app comme une erreur (« pas de faux hors ligne »).
- **Données personnelles** : elles restent dans le stockage de l'app (comme avant), jamais dans le cache du service worker.
- **Mise à jour (D-048)** : `sw.js` et `index.html` ne sont jamais gardés par le cache HTTP, et le worker est enregistré avec `updateViaCache: 'none'`. Chaque export tamponne `sw.js` avec l'empreinte du build (`scripts/pwa/stamp-sw.mjs`, lancé par `build:web` et `build:pwa` ; `check-dist.mjs` refuse un worker non tamponné) : chaque déploiement est un nouveau worker, dont les caches remplacent les anciens. App ouverte pendant un déploiement : bannière « Nouvelle version disponible — Mettre à jour » ; rien ne change avant le toucher, puis la page se recharge. L'app installée cherche une mise à jour quand elle revient au premier plan.
- Le service worker n'est enregistré qu'en production web (`__DEV__` faux), jamais en natif ni dans `expo start`.

## 6. Installer sur l'iPhone

1. Ouvrir **Safari** (le chemin le plus sûr pour l'ajout à l'écran d'accueil).
2. Aller sur l'URL de production, par exemple `https://project-you.pages.dev`.
3. Toucher **Partager** (carré avec une flèche ; sur iOS 26 il est dans le menu **•••** en bas à droite).
4. Faire défiler et toucher **Sur l'écran d'accueil**. Si l'option **Ouvrir comme app web** apparaît, la laisser activée.
5. Garder le nom **PROJECT YOU**, toucher **Ajouter**.
6. Ouvrir l'app **depuis l'icône** : plein écran, sans barre Safari.
7. Se connecter ou créer le compte **dans l'app installée** : son stockage est séparé de Safari.

Confirmation d'e-mail : le lien du mail s'ouvre dans Safari, pas dans l'app installée. Après confirmation, revenir dans l'app installée et se connecter avec l'e-mail et le mot de passe.

## 7. Limites de la PWA par rapport au natif

| Sujet | Web / PWA sur iPhone | App native (plus tard) |
| --- | --- | --- |
| Apple Santé (HealthKit) | pas de lecture ; l'écran Santé permet de noter poids et tour de taille sur place, une ligne annonce la synchro avec l'app native | lecture poids / pas / séances |
| Rappels programmés | indisponibles ; l'écran le dit, les réglages restent enregistrés pour le compte | notifications locales |
| Calendrier de l'appareil | pas d'accès ; disponibilités manuelles + **lien iCal** (D-049, créneaux occupés seulement, compte nécessaire) ; aucun bouton grisé | lecture des heures occupées, calendrier « Project You » |
| Photo du repas | appareil photo et photothèque **via le sélecteur de fichiers de Safari** (pas d'aperçu caméra intégré) | sélecteur natif |
| Position | à chaque recherche, permission gérée par Safari (Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari) ; peut être redemandée | permission de l'app |
| Hors ligne | coquille de l'app + données déjà sur l'appareil ; pas de synchronisation en arrière-plan | idem, plus le premier plan / arrière-plan natif |
| Stockage | séparé de Safari ; **supprimer l'icône efface les données locales** (en mode compte, elles reviennent à la connexion) ; iOS peut le vider si l'iPhone manque de place | stockage de l'app |
| Orientation | iOS ignore `orientation` du manifeste : l'app peut tourner | portrait |
| Divers | pas de Face ID, pas de vibration, pas de fiche App Store | — |

## 8. Vérifications

- Automatisées (Chromium) : `e2e/pwa.spec.ts` — manifeste et icônes, balises iPhone, zoom non bloqué, mode sombre, réouverture hors ligne, cache limité au même site (aucune police), pas de défilement horizontal à 375 px, bouton retour sans historique, bannière de mise à jour.
- Automatisées (WebKit, profil iPhone 15, en CI) et Chromium : `e2e/critical.spec.ts` — 14 écrans clair et sombre sans glyphe manquant (□, U+FFFD, zone PUA), chaque icône dessinée, pas de débordement ; position simulée ; photo choisie par le champ fichier puis analysée (faux projet). **WebKit sous Linux n'est pas Safari iOS** : il valide le moteur (rendu, SVG, service worker, champ fichier, API de position), pas le mode écran d'accueil, le clavier iOS, la vraie caméra, le GPS, les polices iOS ni l'encoche.
- Captures : `scripts/screens/pwa.screens.ts` (iPhone 15, iPhone SE, sombre, bureau).
- **Non vérifiable sans iPhone** : Safari réel, mode écran d'accueil, invite de position iOS, appareil photo via le champ fichier, clavier iOS, barre d'état, encoche. Liste à dérouler : `docs/RELEASE_CHECKLIST.md` § PWA iPhone.
