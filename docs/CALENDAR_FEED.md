# Lien de calendrier iCal (D-049)

Sur la PWA iPhone, l'app n'a pas accès au calendrier de l'appareil. Un lien iCal (planning scolaire, professionnel, Google Agenda, Outlook…) donne les **créneaux occupés** : les séances sont placées en dehors, à l'intérieur des disponibilités manuelles.

> PROJECT YOU utilise uniquement les horaires occupés de ton calendrier pour planifier tes séances. Les titres et détails de tes événements ne sont pas utilisés par le coach.

## Parcours

Calendrier → « Ajouter un calendrier iCal » :

1. Coller le lien (`https://` ou `webcal://`).
2. « Tester le lien » : le serveur lit le calendrier et répond le nombre d'événements des 6 prochaines semaines. **Rien n'est enregistré.**
3. « Utiliser ce calendrier » : le lien est scellé sur le serveur, les plages occupées sont gardées ; le champ est vidé (le lien n'est plus sur l'appareil).
4. Ensuite : interrupteur « Tenir compte de ce calendrier », « Actualiser » (avec la date de dernière synchro), « Supprimer ce calendrier » (confirmation).

Sans compte (mode local), la carte dit qu'un compte est nécessaire : c'est le serveur qui lit le lien. Les disponibilités manuelles restent toujours modifiables (« Modifier mes disponibilités »).

## Architecture

| Couche | Fichier | Rôle |
|---|---|---|
| Edge Function | `supabase/functions/calendar-feed/index.ts` | JWT de l'appelant (RLS), DNS (`Deno.resolveDns` A + AAAA), quota 20 / heure, aucun journal |
| | `handler.ts` | actions `test` / `save` / `refresh`, codes d'erreur, garde les dernières plages si une actualisation échoue |
| | `guard.ts` | URL : HTTPS seulement, `webcal` → `https`, pas d'identifiants ni d'autre port, noms internes et IP privées refusés |
| | `fetch-feed.ts` | téléchargement : redirections manuelles (3, chacune revérifiée), toutes les adresses DNS publiques, 8 s, 3 Mo en flux, contenu VCALENDAR |
| | `ics.ts` | analyse `ical.js` : récurrences, exceptions, annulés / « disponible » ignorés, fuseaux ; sort **uniquement** `{start, end, allDay}` |
| | `crypto.ts` | AES-256-GCM (`CALENDAR_FEED_KEY`), identifiant utilisateur en données associées, format `v1.iv.ct` |
| Base | `supabase/migrations/20261026000001_calendar_feeds.sql` | table `calendar_feeds`, RLS propriétaire, anon sans droit |
| App | `src/providers/calendar-feed.ts` | appels de la fonction, lecture / désactivation / suppression de la ligne (sans la colonne scellée) ; ne garde que les 3 champs horaires |
| | `src/state/calendarFeed.ts` | cache sur l'appareil (`py.calendarFeed.v1`) : hôte, plages, état |
| | `src/features/calendar/useCalendarFeed.ts`, `CalendarFeedCard.tsx` | modèle de vue et carte |
| | `src/hooks/useWeekBusy.ts` | plages de la semaine (appareil + iCal activé) → contraintes fixes de `planWeek` |

## Erreurs affichées

| Code | Cas | Message (FR) |
|---|---|---|
| `invalid_url` | lien illisible | « Ce lien n'est pas valide… » |
| `not_https` | `http://`, autre schéma | « Seuls les liens sécurisés (https ou webcal)… » |
| `blocked_address` | IP privée / locale, nom interne, redirection vers l'un d'eux | « …adresse privée ou locale… » |
| `timeout` | plus de 8 s | « …met trop de temps à répondre… » |
| `access_denied` | 401 / 403 | « …refuse l'accès (lien expiré ou privé)… » |
| `not_found` | 404 / 410 | « Calendrier introuvable… » |
| `not_ics` | page HTML, page de connexion | « …ne renvoie pas un calendrier iCal… » |
| `too_large` | plus de 3 Mo | « …trop volumineux… » |
| `unavailable` | autre panne | « …n'a pas pu être lu pour le moment. Tes disponibilités restent utilisées. » |
| `not_configured` / `not_deployed` | secret absent / fonction absente | message dédié |
| `too_many_requests`, `auth`, `offline` | quota, session expirée, hors ligne | message dédié |

## Planification

- Une plage occupée = une contrainte fixe pour le jour et les heures qu'elle couvre (convertie dans le fuseau de l'appareil ; une plage qui passe minuit est coupée).
- Les événements « journée entière » ne bloquent pas (comme pour le calendrier de l'appareil).
- Aucune hypothèse à partir du titre : le titre n'existe pas dans les données gardées.
- Désactiver le lien rend le plan aux seules disponibilités ; le supprimer efface aussi le cache local.

## Tests

- Fonction (Jest) : `supabase/functions/calendar-feed/__tests__/` — garde SSRF (IPv4 / IPv6 privées, IPv4 intégrée, NAT64, 6to4, noms internes), redirections, taille, délai, VCALENDAR, récurrences et fuseaux, chiffrement, actions et codes HTTP.
- App (Jest) : `src/providers/__tests__/calendar-feed.test.ts` (codes, champs en trop retirés), `src/hooks/__tests__/useWeekBusy.test.ts` (plages, désactivation, planification hors créneaux occupés et dans les disponibilités).
- SQL : `supabase/tests/rls.sql` (isolation A / B), `supabase/tests/settings.sql` (colonnes, contraintes, suppression, migration rejouable).
- E2E (export « compte », faux projet) : `e2e/account/calendar-feed.spec.ts` — coller → tester → utiliser → séances déplacées → actualiser → désactiver → supprimer ; liens refusés.
- **Non testé** : un vrai flux iCal sur Internet (le cloud n'a pas de réseau sortant), la fonction déployée sur le projet réel.

## Déploiement

Runbook : `docs/RELEASE_RUNBOOK.md` § 1 ter (migration), § 2 (`CALENDAR_FEED_KEY`), § 3 (`supabase functions deploy calendar-feed`).
