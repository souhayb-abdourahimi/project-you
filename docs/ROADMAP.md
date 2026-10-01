# Roadmap

Workflow : **AUDIT → ARCHITECTURE → DATA MODEL → FOUNDATION → MVP → TEST → REVIEW → NEXT PHASE.** Une étape ne démarre que si la précédente est stable (typecheck, lint, tests, build verts).

Statuts : `done` · `in progress` · `todo` · `blocked`. Priorités : P0 (bloquant MVP) → P3.

## Ordre exact de construction

### Phase 0 — Fondation

| ID | FEATURE | PRIORITY | STATUS | DEPENDENCIES | RISK | TESTS | DEFINITION OF DONE |
|---|---|---|---|---|---|---|---|
| F-01 | Audit du repository | P0 | done | — | faible | — | état initial documenté dans `DECISIONS.md` |
| F-02 | Docs + règles `.claude/rules` + TODO | P0 | done | F-01 | faible | — | fichiers créés, CLAUDE.md court |
| F-03 | Scaffold Expo SDK 57 + Expo Router + RN Web + TS strict | P0 | done | F-01 | moyen (SDK récent) | typecheck | app démarre web/mobile |
| F-04 | Qualité : ESLint, Prettier, Jest (jest-expo), scripts npm | P0 | done | F-03 | faible | `npm test` | `npm run check` vert |
| F-05 | CI GitHub Actions (install, lint, typecheck, test, test:db, export web) | P0 | done | F-04 | faible | CI | CI verte sur la PR |
| F-06 | Design tokens + primitives UI + dark/light | P0 | done | F-03 | faible | contraste | tokens utilisés partout |
| F-07 | i18n FR/EN | P0 | done | F-03 | faible | clés fr=en | aucune chaîne UI en dur |
| F-08 | Schéma DB v1 + RLS + tests RLS | P0 | done | F-02 | **élevé** (fuite de données) | `test:db` | isolation vérifiée entre 2 utilisateurs + anon |
| F-09 | Types provider-first + mocks MOCK | P0 | done | F-02 | moyen | unit | aucune donnée mock sans `isMock` |
| F-10 | Client Supabase + mode local si non configuré | P0 | done | F-08 | moyen | unit | app utilisable sans backend, bandeau visible |

### Phase 1 — MVP

| ID | FEATURE | PRIORITY | STATUS | DEPENDENCIES | RISK | TESTS | DEFINITION OF DONE |
|---|---|---|---|---|---|---|---|
| M-01 | Création de compte / connexion (email + mot de passe) | P0 | in progress (code + tests live prêts, non exécutés : réseau bloqué) | F-10 | moyen | intégration | inscription, connexion, déconnexion, erreurs lisibles |
| M-02 | Onboarding adaptatif | P0 | done | F-06, F-07 | moyen | unit (étapes) + UI | parcours complet, sauts conditionnels, brouillon local |
| M-03 | Objectif + contrôle de réalisme | P0 | done | M-02 | **élevé** (santé) | unit | objectif agressif → alternative proposée |
| M-04 | Profil + UserContextSnapshot | P0 | done | M-02 | faible | unit | snapshot validé Zod |
| M-05 | NutritionEngine de base | P0 | done | M-04 | **élevé** (santé) | unit + cas limites | planchers de sécurité testés |
| M-06 | Inventaire (CRUD + consommer) | P0 | done | F-10 | faible | unit | offline, états vide/erreur |
| M-07 | Recettes + plan alimentaire (priorité inventaire) | P0 | done | M-05, M-06 | moyen | unit | respecte régime/allergies à 100 % |
| M-08 | Liste de courses | P0 | done | M-07 | faible | unit | plan − inventaire, sans prix inventé |
| M-09 | Budget prévu / dépensé / restant | P1 | done | M-08 | faible | unit | « 34,70 € / 45 € » |
| M-10 | WorkoutEngine + bibliothèque + remplacement | P0 | done | M-04 | moyen | unit | séances adaptées au matériel et aux refus |
| M-11 | Séance guidée + suivi des séries | P0 | done | M-10 | moyen | unit + UI | séries/charges/RPE enregistrés hors ligne |
| M-12 | ProgressionEngine prudent | P1 | done | M-11 | moyen | unit | pas d'augmentation si RPE/fatigue élevés |
| M-13 | Poids + moyenne mobile + mensurations | P0 | done | F-10 | faible | unit | tendance affichée, pas de jugement |
| M-14 | Aujourd'hui / dashboard | P0 | done | M-05..M-13 | moyen | UI | « que faire aujourd'hui » en < 5 s |
| M-15 | Modes « J'ai 15 minutes » / « Pas envie » + anti-abandon | P1 | done | M-10, M-14 | faible | unit | jamais culpabilisant |
| M-16 | Motivation personnalisée | P1 | done | M-02 | faible | unit | utilise la réponse « pourquoi » |
| M-17 | PlanningEngine (créneaux manuels) + calendrier basique | P1 | done | M-10 | moyen | unit | séances placées dans de vrais créneaux, fallback maison |
| M-18 | Notifications locales par catégorie | P1 | done (mobile ; non supporté sur web) | M-14 | moyen | unit | réglables, plafond anti-spam |
| M-19 | Synchronisation Supabase (diff d'états, D-015) | P0 | done (testée sur le vrai schéma ; à valider sur le projet réel) | F-08, F-10 | **élevé** | unit + intégration | hors ligne → en ligne sans perte |
| M-20 | Privacy Center (export, suppression compte/photos) | P0 | done (suppression de compte à valider sur le projet réel) | M-01, M-19 | élevé | intégration | suppression complète vérifiée |
| M-21 | Web responsive (sidebar ≥ 1024 px) | P1 | done | M-14 | faible | UI | toutes les pages MVP utilisables au clavier |
| M-22 | Tests E2E du parcours (web, Playwright) | P1 | done (mode local, mobile + desktop) | M-01..M-17 | moyen | E2E | parcours succès complet vert en CI |
| M-23 | Revue critique MVP (sécurité, a11y, perf) | P0 | done (voir docs/AUDIT.md) | tout | — | — | rapport + corrections |

### Phase 2 — Intégrations réelles

| ID | FEATURE | PRIORITY | STATUS | DEPENDENCIES | RISK | TESTS | DEFINITION OF DONE |
|---|---|---|---|---|---|---|---|
| P2-01 | Import CIQUAL (remplace le catalogue MOCK) | P0 | todo | M-07 | moyen | unit | plus aucun aliment MOCK en prod |
| P2-02 | Scan code-barres + Open Food Facts | P1 | todo | P2-01 | moyen | intégration | confirmation avant ajout |
| P2-03 | HealthKit / Health Connect (lecture) | P1 | done (D-018 ; testé avec modules simulés, à tester sur iPhone/Android réels) | M-20 | élevé | intégration | permissions granulaires, déconnexion |
| P2-04 | Apple Calendar / Google Calendar | P1 | done (calendrier de l'appareil, D-016 ; à tester sur iPhone/Android réels) | M-17 | élevé | intégration | événements app identifiables, jamais d'édition d'événement perso |
| P2-05 | Explorer : lieux, salles, parcs (Places/OSM) | P2 | partial (salles et magasins via OSM, D-017 ; parcs/activités à venir) | — | moyen | intégration | données sourcées et datées |
| P2-06 | Coach IA simple (Edge Function, sorties structurées) | P2 | todo | M-05, M-10 | élevé | unit schémas | toute action validée par schéma + moteur |

### Phase 3 — Avancé

Comparaison de prix, promotions (PromotionProvider réel), scan ticket (OCR + confirmation), scan frigo (détection + confirmation), coach IA avancé, analyses avancées.

### Phase 4 — Mise sur le marché

Abonnement, paywall, analytics avancées, optimisation, bêta, release candidate, App Store, Google Play (vérifier les règles en vigueur des stores avant soumission).
