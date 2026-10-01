# Design system

Style : **premium, moderne, minimaliste, chaleureux, très lisible.** Pas d'interface criarde, pas de gamification infantile, peu de badges.

Source de vérité : `src/theme/tokens.ts`. Les composants n'utilisent **jamais** de couleur ou d'espacement en dur.

## Couleurs

Palette chaude : un corail « braise » pour l'action, des neutres chauds, un vert sauge pour les réussites.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `#FAF8F5` | `#121110` | fond d'écran |
| `surface` | `#FFFFFF` | `#1C1A18` | cards |
| `surfaceMuted` | `#F1EDE8` | `#26231F` | zones secondaires, champs |
| `border` | `#E4DED6` | `#3A3530` | séparateurs |
| `text` | `#1B1917` | `#F5F2EE` | texte principal |
| `textMuted` | `#5F5850` | `#B4ACA2` | texte secondaire |
| `primary` | `#B9431C` | `#FF9166` | CTA, focus |
| `onPrimary` | `#FFFFFF` | `#1B1917` | texte sur CTA |
| `success` | `#2F6B4F` | `#7CC9A0` | séance faite, objectif atteint |
| `warning` | `#8A5A00` | `#F2C46B` | alerte douce (objectif agressif) |
| `danger` | `#B3261E` | `#F2B8B5` | erreurs, suppression |
| `mock` | `#6B4FA0` | `#C9B6F0` | badge **MOCK** |

Contraste : texte et CTA ≥ **4.5:1** en light et dark — vérifié par `src/theme/__tests__/contrast.test.ts`.

## Typographie

Police système (SF Pro / Roboto / system-ui). Échelle : `display 34/40`, `title 24/30`, `heading 18/24`, `body 16/24`, `label 14/20`, `caption 12/16`. Graisses 400/600/700. Respect de la taille de police système (pas de `allowFontScaling={false}`).

## Espacements, rayons, élévation

- Espacements (base 4) : `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48`.
- Rayons : `sm 8 · md 12 · lg 20 · pill 999`.
- Élévation : une seule ombre douce pour les cards en light ; bordure en dark.

## Composants (src/components/ui)

`Screen` (safe area + scroll + largeur max 720 px sur web), `Text` (variantes typo), `Button` (primary / secondary / ghost, états loading/disabled, cible ≥ 44×44), `Card`, `ProgressBar`, `Chip` (choix multiples), `TextField` (label, erreur lisible), `MockBadge`, `EmptyState`, `StatTile`.

## États obligatoires

Chaque écran gère : **chargement**, **vide** (message + action), **erreur** (message compréhensible + réessayer), **hors ligne** (bandeau discret), **donnée indisponible** (« Donnée indisponible », jamais une valeur inventée).

## Mouvement

Micro-animations discrètes (≤ 250 ms), désactivées si « Réduire les animations » est actif (`AccessibilityInfo.isReduceMotionEnabled`).

## Accessibilité

`accessibilityRole` et `accessibilityLabel` sur tout élément interactif, ordre de focus logique, navigation clavier web, pas d'information portée uniquement par la couleur, erreurs formulées en phrases.

## Navigation

Mobile : barre d'onglets (Aujourd'hui, Programme, Nutrition, Progression, Explorer). Web large : sidebar gauche + contenu centré.
