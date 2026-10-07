import fr from '../../../i18n/locales/fr';
import { constraintsFrom } from '../../meals/constraints';
import { planWeek as planMeals } from '../../meals/planner';
import { computeNutritionTargets } from '../../nutrition/engine';
import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import { plannedSessionDates } from '../../training/week-view';
import { weeklyReview, type WeeklyReviewInput } from '../weekly-review';

const WEEK = '2026-09-28';

function input(s = SCENARIOS.studentMediumBudget, patch: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    weekStart: WEEK,
    today: '2026-10-04',
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

describe('weeklyReview: the past week as it was prescribed (W-7 §38)', () => {
  it('a profile changed since then does not rewrite the planned sessions of the past week', () => {
    const s = SCENARIOS.muscleGain;
    // The week was published with 3 sessions; the profile now asks for 4 on other days.
    const records = publishWeek(s, { today: WEEK, weekStart: WEEK, seed: 'local', at: `${WEEK}T07:00:00.000Z` });
    const four = {
      ...s,
      training: { ...s.training, sessionsPerWeek: 4 },
      schedule: {
        ...s.schedule,
        availability: [2, 4, 6, 7].map((day) => ({ day: day as 2 | 4 | 6 | 7, start: '09:00', end: '20:00' })),
      },
    };
    const now = planWeek({ weekStart: WEEK, schedule: four.schedule, training: four.training });
    const dates = plannedSessionDates({
      records,
      facts: { setLogs: {}, completedSessions: [] },
      today: '2026-10-06',
      weeks: [{ weekStart: WEEK, schedule: now.days }],
    });
    const fromProfile = weeklyReview(input(s, { schedule: now, today: '2026-10-04' }));
    const asPrescribed = weeklyReview(input(s, { schedule: now, today: '2026-10-04', plannedSessionDates: dates }));
    expect(fromProfile.sessions.planned).toBe(4);
    expect(asPrescribed.sessions.planned).toBe(3);
  });
});

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
    expect(r.missing.map((p) => p.key)).toContain('review.missing.weight');
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

  it('never counts sessions still ahead in the week as missed', () => {
    // The day before the week starts: nothing is behind yet.
    const monday = weeklyReview(input(undefined, { today: '2026-09-27' }));
    expect(monday.hard.map((p) => p.key)).not.toContain('review.hard.sessions');
    expect(monday.hard.map((p) => p.key)).not.toContain('review.hard.protein');
    expect(monday.adapt.map((p) => p.key)).not.toContain('review.adapt.start_small');
  });

  it('only lists a weight trend as a win when it goes the way of the goal', () => {
    const weights = [
      { date: '2026-09-21', weightKg: 80 },
      { date: '2026-09-23', weightKg: 80 },
      { date: '2026-09-29', weightKg: 81 },
      { date: '2026-10-01', weightKg: 81 },
    ];
    const fatLoss = weeklyReview(input(SCENARIOS.fatLoss, { weights }));
    expect(fatLoss.worked.map((p) => p.key)).not.toContain('review.worked.weight_trend');
    const gain = weeklyReview(input(SCENARIOS.muscleGain, { weights }));
    expect(gain.worked.map((p) => p.key)).toContain('review.worked.weight_trend');
  });

  describe('Ton bilan (D-028)', () => {
    const resolve = (key: string) => key.split('.').reduce((o: Record<string, unknown>, k) => o?.[k] as never, fr);

    it('the main problem is named and answered; pain never gets a diagnosis', () => {
      const r = weeklyReview(
        input(undefined, {
          checkin: { weekStart: WEEK, weekRating: 2, mainProblem: 'pain', answeredAt: '2026-10-04T18:00:00.000Z' },
        }),
      );
      expect(r.hard.map((p) => p.key)).toContain('review.hard.problem.pain');
      expect(r.adapt.map((p) => p.key)).toContain('review.adapt.problem.pain');
      expect(resolve('review.adapt.problem.pain')).toMatch(/professionnel de santé/);
      expect(r.missing.map((p) => p.key)).not.toContain('review.missing.checkin');
    });

    it('"none" adds nothing; no check-in is said, never guessed', () => {
      const none = weeklyReview(
        input(undefined, {
          checkin: { weekStart: WEEK, weekRating: 4, mainProblem: 'none', answeredAt: '2026-10-04T18:00:00.000Z' },
        }),
      );
      expect(none.hard.some((p) => p.key.startsWith('review.hard.problem'))).toBe(false);
      expect(weeklyReview(input(undefined, { checkin: null })).missing.map((p) => p.key)).toContain(
        'review.missing.checkin',
      );
      // Not asked at all (older callers): nothing said about it.
      expect(weeklyReview(input()).missing.map((p) => p.key)).not.toContain('review.missing.checkin');
    });

    it('a replaced session is adapted, not missed; difficult days and records are named', () => {
      const r = weeklyReview(
        input(undefined, {
          completedSessions: [{ date: '2026-09-28', sessionIndex: 0, variant: 'full' }],
          sessionOutcomes: { '2026-09-30#0': { status: 'replaced', replacedBy: 'walk', at: '' } },
          dayLogs: [
            { date: '2026-09-30', mode: 'difficult', activity: 'walk', activityMinutes: 15 },
            { date: '2026-09-20', mode: 'difficult' },
          ],
          records: [
            { exerciseId: 'bench', date: '2026-09-28', loadKg: 50, reps: 8, kind: 'load' },
            { exerciseId: 'bench', date: '2026-09-14', loadKg: 45, reps: 8, kind: 'load' },
          ],
        }),
      );
      expect(r.adapted).toBe(1);
      expect(r.worked).toEqual(
        expect.arrayContaining([
          { key: 'review.worked.adapted', params: { count: 1 } },
          { key: 'review.worked.activity', params: { count: 1 } },
          { key: 'review.worked.records', params: { count: 1 } },
        ]),
      );
      expect(r.hard).toContainEqual({ key: 'review.hard.difficult_days', params: { count: 1 } });
      const sessions = r.hard.find((p) => p.key === 'review.hard.sessions');
      if (sessions) expect(sessions.params?.planned).toBe(r.sessions.planned - 1);
    });

    it('no meal marked on past days: said missing', () => {
      const r = weeklyReview(input());
      expect(r.missing.map((p) => p.key)).toContain('review.missing.meals');
    });

    it('every review key exists in French', () => {
      const r = weeklyReview(
        input(undefined, {
          checkin: null,
          dayLogs: [{ date: '2026-09-30', mode: 'difficult' }],
          sessionOutcomes: { '2026-09-30#0': { status: 'replaced', at: '' } },
        }),
      );
      for (const p of [...r.worked, ...r.hard, ...r.adapt, ...r.nextWeek, ...r.missing]) {
        expect(typeof resolve(p.key)).toBe('string');
      }
      for (const problem of [
        'time',
        'hunger',
        'cravings',
        'fatigue',
        'pain',
        'motivation',
        'budget',
        'social',
        'sleep',
        'schedule',
        'other',
      ]) {
        expect(typeof resolve(`review.hard.problem.${problem}`)).toBe('string');
        expect(typeof resolve(`review.adapt.problem.${problem}`)).toBe('string');
      }
    });
  });
});
