import type { DailyMealPlan, PlannedMeal } from '../../meals/planner';
import type { PlannedDay } from '../../planning/engine';
import { weekdayOf } from '../../shared/dates';
import type { Recommendation } from '../adaptation';
import type { Adjustment } from '../adjustments';
import { coachDay, type CoachDay, type CoachInput } from '../coach';
import { blockerSignal, shortDayMemory } from '../coach-memory';
import { buildDailyPlan, type DailyPlanInput } from '../daily-plan';
import type { Copy } from '../proposal';
import { stateFor, translator, type StatePatch } from './journey';

/** W-7 test helpers: a day of the Daily Coach, then the coach of the day over it. */

export const workoutDay = (date: string): PlannedDay => ({
  date,
  weekday: weekdayOf(date),
  items: [{ kind: 'workout', sessionIndex: 0, location: 'gym', variant: 'full', start: '18:00', end: '19:00' }],
});
export const restDay = (date: string): PlannedDay => ({ date, weekday: weekdayOf(date), items: [{ kind: 'rest' }] });

const meal = (date: string, slot: PlannedMeal['slot'], status: PlannedMeal['status'] = 'planned'): PlannedMeal =>
  ({
    id: `${date}-${slot}`,
    date,
    slot,
    recipeId: 'r',
    servings: 1,
    ingredients: [],
    status,
    usesInventory: [],
  }) as unknown as PlannedMeal;
export const mealsOf = (date: string): DailyMealPlan =>
  ({
    date,
    meals: [meal(date, 'breakfast', 'eaten'), meal(date, 'lunch'), meal(date, 'dinner')],
    targetKcal: 2400,
  }) as unknown as DailyMealPlan;

export function dayInput(today: string, patch: Partial<DailyPlanInput> = {}, state: StatePatch = {}): DailyPlanInput {
  return {
    state: stateFor({ today, startedOn: '2026-08-01', lastActivityDate: today, ...state }),
    day: workoutDay(today),
    meals: mealsOf(today),
    session: { sessionIndex: 0, focus: 'upper', minutes: 60 },
    completed: null,
    outcome: null,
    dayLog: null,
    freeMinutesToday: null,
    fixedConstraintsToday: 0,
    weighInDay: 1,
    tracksWeight: false,
    weighedToday: false,
    weeklyCheckinDue: false,
    counts: { sessions: 12, activeDays: 20, weeks: 3 },
    history: [],
    ...patch,
  };
}

export interface CoachCase {
  today: string;
  day?: Partial<DailyPlanInput>;
  state?: StatePatch;
  coach?: Partial<Omit<CoachInput, 'daily' | 'state'>>;
  /** Facts the cause and memory signals are read from. */
  facts?: {
    plannedDates?: string[];
    doneDates?: string[];
    adjustments?: Adjustment[];
    dayLogs?: { date: string; mode?: 'normal' | 'difficult' | 'short' | 'low_motivation' }[];
  };
}

export function coachCase(c: CoachCase): CoachDay {
  const input = dayInput(c.today, c.day, c.state);
  const daily = buildDailyPlan(input);
  const f = c.facts ?? {};
  return coachDay({
    daily,
    state: input.state,
    proposal: null,
    celebration: null,
    active: [],
    effects: [],
    blocker: blockerSignal({
      today: c.today,
      plannedDates: f.plannedDates ?? [],
      doneDates: f.doneDates ?? [],
      outcomes: {},
      weeklyCheckins: [],
      adjustments: f.adjustments ?? [],
    }),
    shortDay: shortDayMemory({ today: c.today, dayLogs: f.dayLogs ?? [], adjustments: f.adjustments ?? [] }),
    nutrition: { dayIncomplete: false, planGap: false, shoppingToday: false, missingIngredients: null },
    progression: null,
    shown: [],
    ...c.coach,
  });
}

export const proposalOf = (
  key: 'light_week' | 'restart' | 'reduce_volume',
  weekStart = '2026-09-28',
): Recommendation => ({
  id: `reduce_load:${key}:${weekStart}`,
  kind: 'reduce_load',
  change: { key, to: key === 'light_week' ? 'light' : 2 },
  reason:
    key === 'restart'
      ? { key: 'adaptation.reason.restart', params: { days: 20, sessions: 2 } }
      : { key: 'adaptation.reason.light_week', params: { pct: 40 } },
  evidence: { fatigueDays: 3 },
  mode: 'proposed',
  scope: key === 'light_week' ? { kind: 'week', days: 7 } : { kind: 'sessions', sessions: 2, days: 14 },
});

/** Every line the coach would show, rendered in a locale (fails on a missing key). */
export function rendered(coach: CoachDay, locale: 'fr' | 'en' = 'fr'): string[] {
  const t = translator(locale);
  const say = (c: Copy) =>
    t(
      c.key,
      Object.fromEntries(
        Object.entries(c.params).map(([k, v]) => [
          k,
          typeof v === 'string' && v.startsWith('coachDay.') ? t(v) : String(v),
        ]),
      ),
    );
  const actions = [coach.primary, coach.secondary].flatMap((a) =>
    a && (a.kind === 'route' || a.kind === 'day_mode') ? [say(a.label)] : [],
  );
  return [
    ...(coach.calm ? [t('coachDay.calm')] : []),
    ...coach.supportingFacts.map(say),
    ...actions,
    say(coach.explanation.rule),
    ...coach.explanation.facts.map(say),
    ...(coach.question
      ? [say(coach.question.intro), say(coach.question.text), ...coach.question.options.map((o) => say(o.label))]
      : []),
  ];
}
