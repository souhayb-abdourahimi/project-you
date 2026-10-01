/**
 * Transformation Journey Engine: the single source of truth for the user's state
 * (CLAUDE.md rule 6, docs/TRANSFORMATION_JOURNEY.md). Every channel (notifications, Today screen,
 * check-ins, progress) reads this state; none computes its own copy.
 * Built only from logged or measured values (rule 7): nothing is estimated about the body.
 */
import type { WeeklyMealPlan } from '../meals/planner';
import { ADULT_AGE, UNDERWEIGHT_BMI, bmi } from '../nutrition/engine';
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

/** Days without any logged activity after which coming back is a "comeback" (docs/RETENTION.md §2). */
export const COMEBACK_AFTER_DAYS = 3;

export interface JourneyState {
  today: IsoDate;
  /** Where the user is in the journey. `startedOn`: onboarding or first logged data, the earliest. */
  journey: { startedOn: IsoDate; dayIndex: number; firstDay: boolean };
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
    /** Last activity strictly before today, so a comeback stays a comeback all day long. */
    previousActivityDate: IsoDate | null;
    /** Back after at least COMEBACK_AFTER_DAYS days without any logged activity. */
    comeback: boolean;
  };
  difficulties: {
    /** From today's or yesterday's check-in; `unknown` without one. */
    fatigue: 'high' | 'normal' | 'unknown';
  };
  /**
   * Age and weight status, as the nutrition engine sees them (minor_no_deficit,
   * underweight_no_deficit). `noPush`: minor or underweight, so the coach never encourages
   * intensity or a calorie deficit (docs/TRANSFORMATION_JOURNEY.md §4.5).
   */
  profile: {
    age: number | null;
    /** BMI from the latest weigh-in (or the profile weight) and the profile height; never shown. */
    weightStatus: 'underweight' | 'not_underweight' | 'unknown';
    noPush: boolean;
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
  /** First day of the journey (see journeyStart); defaults to the earliest logged date or today. */
  startedOn?: IsoDate;
  /** Other logged activity (light activity, check-ins, meals logged in past weeks). */
  otherActivityDates?: IsoDate[];
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
  /** Last week's plan, so the safety rule still sees the days before Monday. */
  previousMealPlan?: WeeklyMealPlan | null;
  mealName: (recipeId: string) => string | null;
  /** Age in years this year (as the nutrition engine computes it); null when unknown. */
  age: number | null;
  heightCm: number | null;
  /** Weight entered in the profile, used when nothing was weighed yet. */
  profileWeightKg: number | null;
}

const MAIN_SLOTS: MealSlot[] = ['lunch', 'dinner', 'breakfast', 'snack'];

/** How the user logged each day of the meal plans (only what was marked; nothing guessed). */
export function loggedDays(...mealPlans: (WeeklyMealPlan | null | undefined)[]): LoggedDay[] {
  const byDate = new Map<IsoDate, LoggedDay>();
  for (const plan of mealPlans) {
    for (const day of plan?.days ?? []) {
      if (byDate.has(day.date)) continue;
      const eaten = day.meals.filter((m) => m.status === 'eaten');
      const unmarkedMeals = day.meals.filter((m) => m.status === 'planned').length;
      // A replaced meal is logged, but what was eaten instead is unknown: the day is never "complete"
      // for the low-intake rule (it would look lower than it was), yet it is not "unlogged" either.
      const replaced = day.meals.some((m) => m.status === 'replaced');
      const marked = day.meals.length > 0 && unmarkedMeals === 0 && day.meals.some((m) => m.status !== 'skipped');
      byDate.set(day.date, {
        date: day.date,
        complete: day.meals.length > 0 && eaten.length > 0 && unmarkedMeals === 0 && !replaced,
        marked,
        unmarkedMeals,
        kcal: eaten.reduce((sum, m) => sum + m.nutrition.kcal, 0),
        targetKcal: day.targetKcal,
      });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * First day of the journey: the onboarding date or the first logged data, whichever is earlier
 * (redoing the questionnaire must not restart the story).
 */
export function journeyStart(onboardedOn: IsoDate, loggedDates: IsoDate[]): IsoDate {
  return loggedDates.reduce((a, b) => (b < a ? b : a), onboardedOn);
}

function journeyProfile(input: JourneyInput): JourneyState['profile'] {
  const measured = input.weights
    .filter((w) => w.date <= input.today)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg;
  const weightKg = measured ?? input.profileWeightKg;
  const weightStatus: JourneyState['profile']['weightStatus'] =
    weightKg && input.heightCm
      ? bmi(weightKg, input.heightCm) < UNDERWEIGHT_BMI
        ? 'underweight'
        : 'not_underweight'
      : 'unknown';
  const minor = input.age !== null && input.age < ADULT_AGE;
  return { age: input.age, weightStatus, noPush: minor || weightStatus === 'underweight' };
}

export function deriveJourneyState(input: JourneyInput): JourneyState {
  const { today } = input;
  const past = (d: IsoDate) => d <= today;
  const sessionDates = [...new Set(input.sessionDates)].sort();
  const eatenDates = (input.mealPlan?.days ?? [])
    .filter((d) => d.meals.some((m) => m.status === 'eaten'))
    .map((d) => d.date);
  const activity = [
    ...sessionDates,
    ...input.weights.map((w) => w.date),
    ...eatenDates,
    ...(input.otherActivityDates ?? []),
  ].filter(past);
  const lastActivityDate = activity.length ? activity.reduce((a, b) => (a > b ? a : b)) : null;
  const before = activity.filter((d) => d < today);
  const previousActivityDate = before.length ? before.reduce((a, b) => (a > b ? a : b)) : null;
  const startedOn = input.startedOn ?? journeyStart(today, activity);

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
    journey: { startedOn, dayIndex: Math.max(0, daysBetween(startedOn, today)), firstDay: startedOn >= today },
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
      previousActivityDate,
      comeback: previousActivityDate !== null && daysBetween(previousActivityDate, today) >= COMEBACK_AFTER_DAYS,
    },
    difficulties: { fatigue },
    profile: journeyProfile(input),
    safety: evaluateSafety({
      today,
      loggedDays: loggedDays(input.mealPlan, input.previousMealPlan),
      floorKcal: input.floorKcal,
      weights: input.weights,
      sessionDates: input.sessionDates,
      plannedSessionsPerWeek: input.plannedSessionsPerWeek,
      checkins: input.checkins,
    }),
    plan: { mainMeal },
  };
}
