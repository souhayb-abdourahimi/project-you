/**
 * Transformation Journey Engine: the single source of truth for the user's state
 * (CLAUDE.md rule 6, docs/TRANSFORMATION_JOURNEY.md). Every channel (notifications, Today screen,
 * check-ins, progress) reads this state; none computes its own copy.
 * Built only from logged or measured values (rule 7): nothing is estimated about the body.
 */
import type { WeeklyMealPlan } from '../meals/planner';
import type { MealSlot } from '../meals/recipes';
import { weeklyStreak } from '../motivation/anti-abandon';
import type { GoalType, MotivationProfile } from '../profile/schemas';
import { weightTrend, type WeightEntry } from '../progress/weight';
import { addDays, daysBetween, startOfWeek, type IsoDate } from '../shared/dates';
import { evaluateSafety, type LoggedDay, type SafetyAssessment } from './safety';
import { goalFamily, type GoalFamily, type Tone } from './voice/types';

export interface CheckinSignal {
  date: IsoDate;
  energy: number;
  motivation: number;
  fatigue: number;
}

export interface JourneyState {
  today: IsoDate;
  goal: { type: GoalType; family: GoalFamily };
  /** The user's own words (motivations table). */
  motivation: Pick<MotivationProfile, 'why' | 'change' | 'feel'>;
  tone: Tone;
  progress: {
    /** Days with a completed session. */
    sessionDates: IsoDate[];
    sessionsThisWeek: number;
    /** Consecutive past weeks (before this one) with at least one session. */
    weeklyStreak: number;
    /** 7-day weight average moving toward the goal; `unknown` when not weight-based or data is thin. */
    weightDirection: 'toward_goal' | 'steady' | 'unknown';
  };
  momentum: {
    /** Last day with a completed session, a weigh-in or an eaten meal; null when nothing is logged yet. */
    lastActivityDate: IsoDate | null;
    daysSinceActivity: number | null;
  };
  difficulties: {
    /** From today's or yesterday's check-in; `unknown` without one. */
    fatigue: 'high' | 'normal' | 'unknown';
  };
  /** Safety rule (journey/safety.ts): evaluated first, overrides every motivation rule. */
  safety: SafetyAssessment;
  plan: {
    /** Name of the main meal of each planned day (lunch first), in the user's language. */
    mainMeal: Record<IsoDate, string>;
  };
}

export interface JourneyInput {
  today: IsoDate;
  goal: GoalType;
  motivation: MotivationProfile;
  tone: Tone;
  plannedSessionsPerWeek: number;
  /** Calorie floor of the nutrition engine (max of BMR and the absolute floor); null when unknown. */
  floorKcal: number | null;
  sessionDates: IsoDate[];
  weights: WeightEntry[];
  checkins: CheckinSignal[];
  mealPlan: WeeklyMealPlan | null;
  mealName: (recipeId: string) => string | null;
}

const MAIN_SLOTS: MealSlot[] = ['lunch', 'dinner', 'breakfast', 'snack'];

/** How the user logged each day of the meal plan (only what was marked; nothing guessed). */
export function loggedDays(mealPlan: WeeklyMealPlan | null): LoggedDay[] {
  return (mealPlan?.days ?? []).map((day) => {
    const eaten = day.meals.filter((m) => m.status === 'eaten');
    return {
      date: day.date,
      complete: day.meals.length > 0 && eaten.length > 0 && day.meals.every((m) => m.status !== 'planned'),
      kcal: eaten.reduce((sum, m) => sum + m.nutrition.kcal, 0),
      targetKcal: day.targetKcal,
    };
  });
}

export function deriveJourneyState(input: JourneyInput): JourneyState {
  const { today } = input;
  const past = (d: IsoDate) => d <= today;
  const sessionDates = [...new Set(input.sessionDates)].sort();
  const eatenDates = (input.mealPlan?.days ?? [])
    .filter((d) => d.meals.some((m) => m.status === 'eaten'))
    .map((d) => d.date);
  const activity = [...sessionDates, ...input.weights.map((w) => w.date), ...eatenDates].filter(past);
  const lastActivityDate = activity.length ? activity.reduce((a, b) => (a > b ? a : b)) : null;

  const weekStart = startOfWeek(today);
  const weeks: boolean[] = [];
  for (let w = 12; w >= 1; w--) {
    const start = addDays(weekStart, -7 * w);
    weeks.push(sessionDates.some((d) => d >= start && d <= addDays(start, 6)));
  }

  const family = goalFamily(input.goal);
  const trend = weightTrend(input.weights.filter((w) => past(w.date)));
  let weightDirection: JourneyState['progress']['weightDirection'] = 'unknown';
  if (trend.weeklyChangeKg !== null && (family === 'lose' || family === 'gain')) {
    const toward = family === 'lose' ? trend.weeklyChangeKg <= -0.1 : trend.weeklyChangeKg >= 0.1;
    weightDirection = toward ? 'toward_goal' : 'steady';
  }

  const recent = input.checkins
    .filter((c) => past(c.date) && daysBetween(c.date, today) <= 1)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const fatigue: JourneyState['difficulties']['fatigue'] = !recent
    ? 'unknown'
    : recent.fatigue >= 4 || recent.energy <= 2
      ? 'high'
      : 'normal';

  const mainMeal: Record<IsoDate, string> = {};
  for (const day of input.mealPlan?.days ?? []) {
    for (const slot of MAIN_SLOTS) {
      const meal = day.meals.find((m) => m.slot === slot);
      const name = meal ? input.mealName(meal.recipeId) : null;
      if (name) {
        mainMeal[day.date] = name;
        break;
      }
    }
  }

  return {
    today,
    goal: { type: input.goal, family },
    motivation: { why: input.motivation.why, change: input.motivation.change, feel: input.motivation.feel },
    tone: input.tone,
    progress: {
      sessionDates,
      sessionsThisWeek: input.sessionDates.filter((d) => d >= weekStart && past(d)).length,
      weeklyStreak: weeklyStreak(weeks),
      weightDirection,
    },
    momentum: {
      lastActivityDate,
      daysSinceActivity: lastActivityDate ? daysBetween(lastActivityDate, today) : null,
    },
    difficulties: { fatigue },
    safety: evaluateSafety({
      today,
      loggedDays: loggedDays(input.mealPlan),
      floorKcal: input.floorKcal,
      weights: input.weights,
      sessionDates: input.sessionDates,
      plannedSessionsPerWeek: input.plannedSessionsPerWeek,
      checkins: input.checkins,
    }),
    plan: { mainMeal },
  };
}
