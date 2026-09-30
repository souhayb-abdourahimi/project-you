# Sécurité

Construire comme si 10 000 utilisateurs confiaient des données sensibles (poids, photos, santé, motivations).

## Règles

| Domaine | Règle |
|---|---|
| Accès aux données | RLS sur **toutes** les tables ; politiques par `auth.uid()` ; tests RLS en CI (`npm run test:db`). |
| Secrets | Aucun secret dans le client ni dans git. Le client ne connaît que l'URL Supabase et la clé **anon** (publique par conception). Clés IA, APIs payantes, `service_role` : uniquement dans les secrets des Edge Functions. |
| Fichiers env | `.env`, `.env.local`, `.env*.local` ignorés ; `.env.example` documente les variables. |
| Validation | Toute entrée utilisateur et toute réponse externe/IA est validée par un schéma **Zod** avant usage ; contraintes `check` côté base en seconde ligne. |
| Sanitation | Pas de HTML interprété depuis une source externe ; textes libres affichés comme texte. |
| Journaux | Logs minimaux : jamais de poids, photos, réponses de motivation, tokens ou emails dans les logs ou l'analytics. |
| Photos | Bucket Storage **privé**, chemins `<user_id>/…`, politiques Storage par utilisateur, URLs signées à courte durée. Jamais envoyées automatiquement à un modèle externe. |
| Session | supabase-js, session persistée sur l'appareil ; rafraîchissement automatique ; déconnexion efface les stores locaux. |
| API / Edge Functions | Vérification du JWT, rate limiting par utilisateur, timeouts, réponses d'erreur génériques. |
| Admin / debug | Écran dev visible **uniquement** si `__DEV__` ; aucune route admin en production. |
| Suppression | Suppression de compte complète (cascade + Storage) depuis le Privacy Center. |
| Dépendances | Pas de dépendance ajoutée « pour faire joli » ; `npm audit` suivi en CI (non bloquant au départ). |

## Revue à chaque grande étape

Sécurité, données, permissions, RLS, secrets, logs. Voir la checklist dans `.claude/rules/security.md`.

## Signalement

Toute faille découverte : l'écrire dans `TODO.md` (section Sécurité) avec priorité P0 et la corriger avant la suite.
