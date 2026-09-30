# Project You — Spécification produit

> Source : le « MASTER BUILD PROMPT » du 2026-09-30 (fil « Fondation et MVP Project You »).
> Ce document en est la version structurée et maintenue. En cas de conflit, la règle la plus prudente l'emporte (sécurité > exactitude > fiabilité > simplicité > UX > maintenabilité > extensibilité > esthétique).

## 1. Vision

Project You est un **coach personnel adaptatif** (mobile iOS/Android + web) qui combine alimentation, entraînement, planning, budget et progression, et qui s'adapte à la **vraie vie** de l'utilisateur plutôt qu'à un emploi du temps idéal.

Question centrale à laquelle chaque écran doit répondre : **« Qu'est-ce que je dois faire maintenant ? »**

Boucle produit :

```
PROFIL → OBJECTIF → CONTRAINTES → PLAN → ACTION → MESURE → ANALYSE → ADAPTATION
```

## 2. Objectifs supportés

| Code | Objectif | Indicateurs principaux |
|---|---|---|
| `fat_loss` | Perte de gras | tour de taille, moyenne de poids, performances |
| `weight_loss` | Perte de poids | moyenne de poids (7 j), régularité |
| `muscle_gain` | Prise de masse | charges, moyenne de poids, mensurations |
| `recomposition` | Recomposition | **tour de taille, performances, photos, régularité** (la balance peut bouger peu) |
| `maintenance` | Maintien | stabilité du poids, régularité |
| `fitness` | Condition physique | volume d'activité, séances réalisées |
| `performance` | Performance | charges, répétitions, RPE |

Le poids n'est **jamais** l'unique indicateur.

## 3. Règles absolues

1. **Honnêteté** : aucune promesse de résultat ; toute estimation est présentée comme telle ; un objectif trop agressif déclenche : explication → trajectoire raisonnable proposée → l'utilisateur garde le choix → aucune culpabilisation.
2. **Sécurité** : jamais de restriction extrême, déshydratation volontaire, surentraînement, compensation, ni de pratique pouvant favoriser un trouble alimentaire. Pas de diagnostic médical ; en cas de douleur importante ou persistante, orienter vers un professionnel sans deviner la cause.
3. **Ne jamais inventer de donnée externe** (prix, promotions, horaires, fréquentation, adresses, équipements, sécurité d'une zone, temps de trajet…). Sans donnée réelle : « Donnée indisponible ». Toute donnée de démonstration est marquée **MOCK**.
4. **Calculs critiques déterministes** : l'IA explique, elle ne calcule pas (voir `AI_ARCHITECTURE.md`).

## 4. Parcours cible (définition du succès)

```
INSCRIPTION → ONBOARDING → OBJECTIF → PLAN PERSONNALISÉ → REPAS → INVENTAIRE
→ COURSES → SÉANCE → SUIVI → PROGRESSION → ADAPTATION
```

## 5. Onboarding (adaptatif)

Une question (ou un petit groupe cohérent) par écran, barre de progression, retour possible, brouillon sauvegardé localement.

| Section | Questions | Conditions d'affichage |
|---|---|---|
| Profil | pseudo, âge, taille, poids, sexe (pour le calcul, « préfère ne pas dire » possible), niveau d'activité | toujours |
| Objectif | objectif, poids souhaité, délai, priorités (esthétique, force, santé, performance) | poids souhaité et délai seulement si l'objectif concerne le poids |
| Motivation | 5 questions ouvertes (pourquoi, changement, ressenti, risque d'abandon, fierté 3–6 mois) | toujours, toutes facultatives |
| Vie | statut (étudiant, salarié, indépendant, sans emploi, autre) | toujours |
| Budget | budget alimentaire hebdomadaire (mensuel dérivé) | toujours |
| Cuisine | équipement (four, plaques, micro-ondes, congélateur, blender…) | toujours |
| Alimentation | régime, allergies, intolérances, interdits, détestés, préférés, nb de repas, temps de cuisine | les listes d'aliments proposées sont filtrées par le régime (vegan → pas de question sur la viande) |
| Sport | salle ? → nom, abonnement ; niveau, jours, durée, matériel, sports aimés/refusés, exercices refusés | détails salle seulement si l'utilisateur a une salle ; matériel maison seulement sinon |
| Planning | créneaux disponibles, contraintes fixes | toujours |

La logique « quelle étape afficher » est une fonction pure testée : `src/domain/onboarding/steps.ts`.

## 6. Fonctionnalités MVP (voir `ROADMAP.md` pour l'ordre)

- **Compte** (Supabase Auth, email + mot de passe), suppression de compte.
- **Onboarding** adaptatif → `UserContextSnapshot`.
- **Moteur nutrition** : estimation énergétique, macros, contrôle de réalisme de l'objectif.
- **Inventaire** « Ce que j'ai chez moi » : ajouter / modifier / supprimer / consommer (scan en phase 2).
- **Recettes** et **plan alimentaire** journalier/hebdomadaire priorisant l'inventaire ; chaque repas : consommer / remplacer / modifier.
- **Liste de courses** générée (plan − inventaire), coût seulement si prix réel connu.
- **Budget** : prévu / dépensé / restant (« 34,70 € / 45 € »).
- **Programme sportif** (WorkoutEngine) + **séances** + **remplacement d'exercice** (« Je n'ai pas la machine », « Je veux plus facile »…).
- **Suivi de performance** (séries, charge, répétitions, RPE) + **progression prudente**.
- **Poids** et mensurations, moyenne mobile.
- **Aujourd'hui** / dashboard : repas, séance, rappels, CTA « Commencer ».
- **Modes** « J'ai 15 minutes » et « Je n'ai pas envie » (anti-abandon, jamais de culpabilisation).
- **Motivation** personnalisée à partir des réponses d'onboarding.
- **Notifications** locales réglables par catégorie, sans spam.
- **Calendrier basique** : créneaux saisis manuellement ; connexion calendrier réelle en phase 2.
- **Web responsive**, FR/EN, dark/light, accessibilité.

## 7. Hors MVP (phases 2–4)

Scan code-barres, HealthKit / Health Connect, Google/Apple Calendar, lieux et salles (Explorer), promotions, comparaison de prix, scan ticket et frigo, coach IA avancé, abonnement, publication stores. Détail : `ROADMAP.md`.

## 8. Navigation

- Mobile : onglets **Aujourd'hui · Programme · Nutrition · Progression · Explorer** ; Profil, Coach et Réglages accessibles depuis l'en-tête.
- Web (≥ 1024 px) : sidebar + contenu.

## 9. Ton et motivation

Chaleureux, direct, jamais culpabilisant. Une petite séance n'est jamais une journée ratée. Une série interrompue ne « détruit » rien : on reprend simplement.
