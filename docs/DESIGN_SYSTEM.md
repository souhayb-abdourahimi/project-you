# Design system (W-9)

Direction validée par Souhayb (2026-10-06, W-9 du 2026-10-07) : **iOS premium, lumineux, beaucoup d'air, fond blanc cassé, bleu profond, graphite pour les surfaces fortes, couleur avec parcimonie.** Calme, précis, personnel, adulte. Jamais médical, agressif, enfantin, gamifié ou chargé.

Principe : _« Qu'est-ce que l'utilisateur doit comprendre ou faire maintenant ? »_ Chaque écran a **une** priorité visuelle.

Source de vérité : `src/theme/tokens.ts`. Les écrans et composants n'écrivent **jamais** une couleur, une taille, un rayon, une ombre ou une durée en dur.

La couche domaine reste souveraine : `données → règles → moteurs déterministes → recommandations → UI`. Un écran lit un hook ou un view model (`src/features/*/view.ts`, `proposalView`…) et ne décide rien.

## Couleurs

| Rôle | Tokens |
|---|---|
| Base | `background` `#F4F5F7`, `surface` / `surfaceRaised` `#FFFFFF`, `surfaceSubtle` `#EDF0F4` |
| Surface forte | `inverse` `#121722` (graphite), `onInverse`, `onInverseMuted`, `inverseFill` |
| Texte | `textPrimary` `#0F172A`, `textSecondary` `#475467`, `textMuted` `#5D6676` |
| Bordures | `border` `#E3E7ED`, `borderStrong` `#C9D0DA` |
| Action | `primary` `#1D4ED8`, `primaryPressed`, `primarySubtle`, `onPrimary` |
| Sémantique | `success`, `warning`, `danger`, `info` et leurs fonds `*Subtle` |
| Métier | `training`, `nutrition`, `progress`, `recovery` : une petite icône, jamais un aplat |
| Démo | `mock` (badge **MOCK** obligatoire) |

Anciens noms gardés comme alias (`text`, `surfaceMuted`) pour les écrans pas encore repris.

**Contraste** : tout niveau de texte ≥ 4.5:1 sur toutes les surfaces, en clair et en sombre, ainsi que les libellés sur `primary`, `inverse`, et chaque couleur sur son fond `*Subtle` — `src/theme/__tests__/contrast.test.ts`.

**No-guilt design** : une séance manquée est grise (`neutral`), jamais rouge. Le rouge est réservé à une vraie erreur ou à une action destructive. La sécurité a sa surface dédiée (`Notice tone="caution"`) : identifiable, jamais alarmiste.

**Mode sombre** : la palette sombre porte les mêmes noms et suit le système ; elle passe le test de contraste mais n'est pas encore relue écran par écran. Le thème clair est prioritaire.

## Typographie

Police système (SF Pro / Roboto / system-ui), taille système respectée (pas de `allowFontScaling={false}`).

`display 34` · `title1 28` · `title2 22` · `title3 20` · `headline 17` · `body 16` · `bodyMedium 16` · `caption 13` · `captionStrong 13` · `overline 12` (capitales espacées) · `micro 11` (onglets) · `metric 26` · `metricLarge 44`. Les chiffres (`metric*`) sont tabulaires ; l'unité est plus petite et secondaire (`77,7` fort, `kg` discret).

Les variantes `display`, `title*`, `heading` sont annoncées comme titres.

## Espacements, rayons, élévation, mouvement

- Espacements (base 4) : `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48` ; rythme des écrans `layout` : gouttière 20, padding de carte 20, entre sections 28, entre cartes 12.
- Rayons : `input 14 · button 16 · lg 20 · card 22 · sheet 28 · pill 999`.
- Élévation : `card` (ombre à peine visible), `raised` (héros, barre d'onglets). En sombre : une bordure fine.
- Icônes : `sm 16 · md 20 · lg 24 · xl 28`.
- Mouvement : `fast 120 · base 200 · slow 320` ms ; pression = échelle 0,98, pas de rebond. Toute animation est coupée quand « Réduire les animations » est actif (`useReducedMotion`).
- Opacités : `pressed 0.86 · disabled 0.4 · subtle 0.6`.

## Icônes

Une seule famille : **SF Symbols** sur iOS, **Material Symbols** sur Android et le web, via `expo-symbols` (déjà installé). Les écrans nomment une icône par son sens (`<Icon name="workout" />`) ; la table `ICONS` (`src/components/ui/Icon.tsx`) est le seul endroit qui connaît les glyphes. Les icônes sont décoratives : l'élément qui les porte porte le nom accessible.

## Composants (`src/components/ui`)

| Composant | Rôle |
|---|---|
| `Text` | variantes typo, couleur par token |
| `Button` | `primary` (une seule action principale), `secondary`, `tertiary`, `ghost`, `destructive` (+ `danger` historique) ; `compact`, `block`, `icon`, `onDark` ; états pressé, désactivé, chargement ; cible ≥ 44 pt |
| `IconButton` | bouton rond à icône seule, nommé pour les lecteurs d'écran |
| `Card` | la carte de base (`SurfaceCard`) avec un ton : `surface`, `subtle`, `inverse`, `accent`, `caution`, `positive` |
| `HeroCard` | la priorité d'un écran : surtitre, grand titre, faits en chips, actions |
| `MetricCard` | un chiffre qui compte : libellé, valeur, unité, ligne courte ; lu comme une phrase |
| `ActionCard` | une carte-ligne qui ouvre un écran |
| `Badge` | chip d'état (durée, version, statut) : information, jamais un bouton |
| `Chip` / `ChoiceGroup` | choix (radio / cases), état annoncé |
| `Notice` | note teintée : `neutral`, `info`, `caution` (sécurité), `positive`, `danger` ; `Banner` en est l'ancienne forme |
| `ListGroup` / `ListRow` | sections groupées type iOS : titre, valeur actuelle, chevron |
| `ScreenHeader`, `Section`, `Avatar` | en-tête d'écran, section, initiale (aucune photo inventée) |
| `Skeleton`, `LoadingScreen` | chargement en forme de l'écran à venir, pas de gros spinner |
| `EmptyState` | explique, rassure, propose l'étape suivante |
| `HeroMedia` | le visuel du héros : le média réel de la séance s'il existe (`uri`), sinon le visuel de la bibliothèque Project You (halo `gradients.heroGlow`, anneaux, pictogramme du type) ; jamais une photo prise au hasard ; décoratif, le héros reste lisible sans lui |
| `ProgressRing` | UN anneau pour UNE valeur principale (Aujourd'hui : protéines des repas notés / cible) ; valeur dite en texte (`accessibilityValue.text`) ; jamais quatre anneaux |
| `MiniBars` | petit graphique en barres d'une semaine, données réelles seulement : un jour sans donnée est un point, jamais une barre à zéro ; dessiné à partir de 3 jours connus, sinon la valeur seule ; décrit en une phrase |
| `CoachNote` | le mot du coach : pastille, « Ton coach », un message court, une action au plus ; une note, pas un chat |

Les cartes métier (séance, repas, progrès, coach) se composent de ces primitives dans `src/features/*` ; pas de quarante variantes presque identiques.

## Navigation

Cinq onglets, partout dans le même ordre : **Aujourd'hui, Programme, Nutrition, Progrès, Profil**. iOS / Android : la barre native de la plateforme (`NativeTabs`) aux couleurs de l'app (zones sûres, retour, accessibilité natives). Web : barre basse (icône + libellé, pastille douce sur l'onglet actif) sur mobile, barre latérale sobre au-delà de 1024 px, contenu centré à 640 px. Le Profil regroupe et résume ; chaque réglage reste dans l'écran qui le possède (D-043).

## États obligatoires

Chaque écran gère : **chargement** (squelette), **vide** (explication + action), **erreur** (phrase compréhensible + réessayer), **hors ligne / synchronisation** (ligne discrète), **donnée indisponible** (jamais une valeur inventée).

## Captures

`npm run build:web && npm run screens` : états principaux en iPhone 15, petit iPhone, Android moyen et desktop, dans `screens/` (non versionné). Ce sont des captures pour la revue, pas des assertions.

## Accessibilité

`accessibilityRole` et nom sur tout élément interactif, état sélectionné / étendu annoncé (natif et `aria-*` sur le web), cibles ≥ 44 pt, aucune information portée par la seule couleur, taille de police système respectée, graphiques décrits par une phrase.
