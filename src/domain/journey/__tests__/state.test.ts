import type { WeeklyMealPlan } from '../../meals/planner';
import { deriveJourneyState, loggedDays, type JourneyInput } from '../state';

type Status = 'planned' | 'eaten' | 'skipped';
/** Minimal meal plan: only the fields the journey reads. */
const mealPlan = (days: { date: string; meals: [string, Status, number][]; targetKcal?: number }[]) =>
  ({
    weekStart: '2026-09-28',
    days: days.map((d) => ({
      date: d.date,
      targetKcal: d.targetKcal ?? 2000,
      meals: d.meals.map(([slot, status, kcal], i) => ({
        id: `${d.date}-${i}`,
        date: d.date,
        slot,
        recipeId: `${slot}_recipe`,
        status,
        nutrition: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
      })),
    })),
  }) as unknown as WeeklyMealPlan;

const base: JourneyInput = {
  today: '2026-10-01',
  goal: 'fat_loss',
  motivation: { why: 'être fier de moi', quitRisk: 'le travail' },
  tone: 'gentle',
  plannedSessionsPerWeek: 3,
  floorKcal: 1400,
  sessionDates: [],
  weights: [],
  checkins: [],
  mealPlan: null,
  mealName: (id) => (id === 'lunch_recipe' ? 'Curry de lentilles' : null),
};

describe('journey state (single source of truth)', () => {
  it('starts empty for a new user, without inventing anything', () => {
    const s = deriveJourneyState(base);
    expect(s.momentum).toEqual({ lastActivityDate: null, daysSinceActivity: null });
    expect(s.progress).toEqual({ sessionDates: [], sessionsThisWeek: 0, weeklyStreak: 0, weightDirection: 'unknown' });
    expect(s.difficulties.fatigue).toBe('unknown');
    expect(s.safety.active).toBe(false);
    expect(s.goal).toEqual({ type: 'fat_loss', family: 'lose' });
    // Only the three answers the voice may quote, never quitRisk.
    expect(s.motivation).toEqual({ why: 'être fier de moi', change: undefined, feel: undefined });
  });

  it('takes the last activity from sessions, weigh-ins and eaten meals, never from the future', () => {
    const s = deriveJourneyState({
      ...base,
      sessionDates: ['2026-09-25', '2026-10-03'],
      weights: [{ date: '2026-09-27', weightKg: 80 }],
      mealPlan: mealPlan([{ date: '2026-09-28', meals: [['lunch', 'eaten', 600]] }]),
    });
    expect(s.momentum).toEqual({ lastActivityDate: '2026-09-28', daysSinceActivity: 3 });
  });

  it('counts this week’s sessions and the weekly streak', () => {
    const s = deriveJourneyState({
      ...base,
      sessionDates: ['2026-09-08', '2026-09-16', '2026-09-23', '2026-09-29', '2026-09-30'],
    });
    expect(s.progress.sessionsThisWeek).toBe(2);
    expect(s.progress.weeklyStreak).toBe(3);
  });

  it('reads the weight direction from logged weigh-ins only, for weight goals', () => {
    const weights = [
      ...['2026-09-18', '2026-09-20', '2026-09-22'].map((date) => ({ date, weightKg: 81 })),
      ...['2026-09-26', '2026-09-28', '2026-09-30'].map((date) => ({ date, weightKg: 80.4 })),
    ];
    expect(deriveJourneyState({ ...base, weights }).progress.weightDirection).toBe('toward_goal');
    expect(deriveJourneyState({ ...base, goal: 'muscle_gain', weights }).progress.weightDirection).toBe('steady');
    expect(deriveJourneyState({ ...base, goal: 'fitness', weights }).progress.weightDirection).toBe('unknown');
  });

  it('uses only today’s or yesterday’s check-in for fatigue', () => {
    const tired = { date: '2026-09-30', energy: 3, motivation: 3, fatigue: 4 };
    expect(deriveJourneyState({ ...base, checkins: [tired] }).difficulties.fatigue).toBe('high');
    expect(deriveJourneyState({ ...base, checkins: [{ ...tired, date: '2026-09-28' }] }).difficulties.fatigue).toBe(
      'unknown',
    );
    expect(deriveJourneyState({ ...base, checkins: [{ ...tired, fatigue: 2 }] }).difficulties.fatigue).toBe('normal');
  });

  it('names the main meal of each day, lunch first', () => {
    const s = deriveJourneyState({
      ...base,
      mealPlan: mealPlan([
        {
          date: '2026-10-02',
          meals: [
            ['breakfast', 'planned', 400],
            ['lunch', 'planned', 700],
          ],
        },
      ]),
    });
    expect(s.plan.mainMeal).toEqual({ '2026-10-02': 'Curry de lentilles' });
  });

  it('feeds the safety rule with what the user logged, and nothing else', () => {
    const plan = mealPlan(
      ['2026-09-28', '2026-09-29', '2026-09-30'].map((date) => ({
        date,
        meals: [
          ['breakfast', 'eaten', 300],
          ['lunch', 'eaten', 500],
          ['dinner', 'skipped', 0],
        ] as [string, Status, number][],
      })),
    );
    expect(loggedDays(plan).map((d) => [d.complete, d.kcal])).toEqual([
      [true, 800],
      [true, 800],
      [true, 800],
    ]);
    const s = deriveJourneyState({ ...base, mealPlan: plan });
    expect(s.safety.flags).toEqual(['low_intake']);
    expect(s.safety.belowFloor).toBe(true);

    // A meal left "planned" means the day is not fully logged: the rule does not guess.
    const partial = mealPlan(
      ['2026-09-28', '2026-09-29', '2026-09-30'].map((date) => ({
        date,
        meals: [
          ['lunch', 'eaten', 500],
          ['dinner', 'planned', 900],
        ] as [string, Status, number][],
      })),
    );
    expect(deriveJourneyState({ ...base, mealPlan: partial }).safety.active).toBe(false);
    // Everything skipped: the plan was not used, not a low-intake day.
    const skipped = mealPlan(
      ['2026-09-28', '2026-09-29', '2026-09-30'].map((date) => ({
        date,
        meals: [['lunch', 'skipped', 0]] as [string, Status, number][],
      })),
    );
    expect(deriveJourneyState({ ...base, mealPlan: skipped }).safety.active).toBe(false);
  });
});
