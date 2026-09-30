import { constraintsFrom } from '../../meals/constraints';
import { planWeek as planMeals } from '../../meals/planner';
import { computeNutritionTargets } from '../../nutrition/engine';
import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import { weeklyReview, type WeeklyReviewInput } from '../weekly-review';

const WEEK = '2026-09-28';

function input(s = SCENARIOS.studentMediumBudget, patch: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    weekStart: WEEK,
    goal: s.goal.type,
    schedule: planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training }),
    completedSessions: [],
    setLogs: {},
    mealPlan: planMeals(WEEK, {
      targets: computeNutritionTargets(s, 2026),
      constraints: constraintsFrom(s.nutrition, s.lifestyle.kitchen),
      preferences: s.nutrition,
      inventory: [],
      today: WEEK,
    }),
    weights: [],
    waist: [],
    expenses: [],
    weeklyBudgetCents: s.budget.weeklyFoodBudgetCents,
    ...patch,
  };
}

describe('weeklyReview', () => {
  it('counts a short session as a win and proposes smaller steps, never blame', () => {
    const r = weeklyReview(
      input(undefined, { completedSessions: [{ date: '2026-09-30', sessionIndex: 0, variant: 'short' }] }),
    );
    expect(r.sessions.done).toBe(1);
    expect(r.worked.map((p) => p.key)).toEqual(
      expect.arrayContaining(['review.worked.sessions', 'review.worked.short_counts']),
    );
    expect(r.adapt.map((p) => p.key)).toContain('review.adapt.shorter_sessions');
  });

  it('says weight data is missing instead of guessing', () => {
    const r = weeklyReview(input());
    expect(r.weight).toEqual({ averageKg: null, changeKg: null, entries: 0 });
    expect(r.hard.map((p) => p.key)).toContain('review.hard.no_weight');
  });

  it('does not rely on the scale alone for recomposition', () => {
    const r = weeklyReview(
      input(SCENARIOS.recomposition, {
        weights: [
          { date: '2026-09-22', weightKg: 75 },
          { date: '2026-09-30', weightKg: 75.4 },
        ],
      }),
    );
    expect(r.worked.map((p) => p.key)).not.toContain('review.worked.weight_trend');
    expect(r.adapt.map((p) => p.key)).toContain('review.adapt.measure_waist');
  });

  it('reports waist change, budget overrun and high effort', () => {
    const r = weeklyReview(
      input(undefined, {
        waist: [
          { date: '2026-09-20', cm: 90 },
          { date: '2026-10-01', cm: 89 },
        ],
        expenses: [{ id: 'e', amountCents: 6000, spentOn: '2026-09-29' }],
        setLogs: { '2026-09-30#0': { goblet_squat: [{ reps: 8, loadKg: 20, rpe: 9.5 }] } },
      }),
    );
    expect(r.waistChangeCm).toBe(-1);
    expect(r.hard.map((p) => p.key)).toEqual(expect.arrayContaining(['review.hard.budget', 'review.hard.effort']));
    expect(r.adapt.map((p) => p.key)).toEqual(
      expect.arrayContaining(['review.adapt.use_inventory', 'review.adapt.lighter_week']),
    );
  });

  it('reads protein coverage from the meal plan', () => {
    const r = weeklyReview(input(SCENARIOS.veganFatLoss));
    expect(r.meals?.proteinDaysMet).toBe(7);
  });
});
