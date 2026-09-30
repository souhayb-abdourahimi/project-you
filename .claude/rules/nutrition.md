# Nutrition rules

- All energy/macro math lives in `src/domain/nutrition` as pure functions. Never compute targets in UI or via an LLM.
- Formula: Mifflin-St Jeor + activity factor (see `docs/NUTRITION_ENGINE.md`). Any change needs a test and a `docs/DECISIONS.md` entry.
- Safety floors are non-negotiable: calories never below BMR nor below the absolute floor; loss rate capped (~1 % bodyweight/week); no deficit for users under 18.
- An aggressive goal is never refused silently: return a `feasibility` result with the reason and a realistic alternative; the user keeps the choice.
- Never output: extreme restriction, fasting to compensate, dehydration, "burn off" framing, moralising words ("cheat", "bad food").
- Allergies and diet (vegan/vegetarian) are hard constraints: a recipe violating them must be impossible, not merely unlikely. Test it.
- Numbers shown to users are estimates: label them "estimation".
