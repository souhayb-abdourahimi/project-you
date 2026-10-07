/**
 * View model of the Today screen (W-9): how the decisions already taken by the domain are laid out.
 * Nothing here decides what leads (coachDay does), recomputes a target or invents a value: it only
 * picks the words and the few numbers the screen shows, from the plan, the journey and real data.
 */
import type { DailyItem } from '@/domain/journey/daily-plan';
import type { BodyBlock } from '@/domain/journey/progress-journey';
import type { PlannedMeal } from '@/domain/meals/planner';
import { addDays, startOfWeek, type IsoDate } from '@/domain/shared/dates';
import { isDone, type WeekComparison } from '@/domain/training/compare';
import { dayIntake } from '@/features/nutrition/view';

/** The few lines under the hero's title: planned facts only. */
export type HeroChip =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'variant'; variant: 'short' | 'light' }
  | { kind: 'location'; location: string }
  | { kind: 'start'; time: string };

export interface HeroContent {
  /** The hero's title: the focus of a session, else the item's own line (itemLabel). */
  focus: string | null;
  chips: HeroChip[];
  /** The graphite surface (with its visual) is kept for a session to do; a calmer day stays light. */
  tone: 'inverse' | 'surface';
}

export function heroContent(item: DailyItem): HeroContent {
  const p = item.params;
  const chips: HeroChip[] = [];
  const minutes = Number(p.minutes);
  if (item.kind === 'workout' && item.status === 'todo') {
    if (Number.isFinite(minutes) && minutes > 0) chips.push({ kind: 'minutes', minutes });
    if (p.variant === 'short' || p.variant === 'light') chips.push({ kind: 'variant', variant: p.variant });
    if (p.location === 'gym' || p.location === 'home') chips.push({ kind: 'location', location: p.location });
    if (typeof p.start === 'string' && p.start) chips.push({ kind: 'start', time: p.start });
    return { focus: typeof p.focus === 'string' ? p.focus : null, chips, tone: 'inverse' };
  }
  return { focus: null, chips, tone: 'surface' };
}

/** A day of the week strip: neutral words, a session not done is never "missed" (no guilt). */
export type WeekDayState = 'done' | 'adapted' | 'planned' | 'not_done' | 'rest';

export interface TodayGlance {
  /** Protein of the meals marked eaten (the leading number), energy second; planned values. */
  nutrition: { proteinG: number; proteinTargetG: number; kcal: number; kcalTarget: number } | null;
  /** This week's sessions, done over planned, and a strip Monday → Sunday. */
  week: { done: number; planned: number; days: { date: IsoDate; state: WeekDayState; today: boolean }[] } | null;
  /** Steps measured by the phone: today, and the last seven days when at least three are known. */
  steps: { today: number | null; days: (number | null)[] | null } | null;
  /** Recent average of real weigh-ins and the change since the start, only when the goal shows it. */
  weight: { kg: number; changeKg: number | null } | null;
}

export interface GlanceInput {
  today: IsoDate;
  week: WeekComparison;
  /** Today's planned meals; null without a meal plan. */
  meals: readonly PlannedMeal[] | null;
  proteinTargetG: number;
  kcalTarget: number;
  /** Daily step totals from Apple Health / Health Connect; null when steps are not shared. */
  steps: readonly { date: IsoDate; value: number }[] | null;
  weight: { currentAvgKg: number | null; changeKg: number | null } | null;
  /** Body blocks the goal shows (bodyOrder): weight is never pushed when the goal hides it. */
  bodyOrder: readonly BodyBlock[];
}

/** Days with data needed before the steps chart is drawn (otherwise: the value alone). */
export const MIN_STEP_DAYS = 3;

function weekStrip(week: WeekComparison, today: IsoDate): TodayGlance['week'] {
  // A week whose prescriptions are unknown has no honest denominator (W-7.1).
  if (week.planned === 0 || week.prescriptionUnknown) return null;
  const monday = startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const sessions = week.sessions.filter((s) => s.date === date && s.status !== 'moved');
    let state: WeekDayState = 'rest';
    if (sessions.some((s) => isDone(s.status))) state = 'done';
    else if (sessions.some((s) => s.status === 'replaced')) state = 'adapted';
    else if (sessions.some((s) => s.status === 'skipped' || (s.status === 'not_recorded' && date < today)))
      state = 'not_done';
    else if (sessions.length > 0) state = 'planned';
    return { date, state, today: date === today };
  });
  return { done: week.done, planned: week.planned, days };
}

export function todayGlance(input: GlanceInput): TodayGlance {
  const { meals, today } = input;
  let nutrition: TodayGlance['nutrition'] = null;
  if (meals && meals.length > 0 && input.proteinTargetG > 0) {
    // Meals the user marked as eaten, with their planned values: the same sum as Nutrition.
    const intake = dayIntake(meals);
    nutrition = {
      proteinG: intake.proteinG,
      proteinTargetG: Math.round(input.proteinTargetG),
      kcal: intake.kcal,
      kcalTarget: Math.round(input.kcalTarget),
    };
  }

  let steps: TodayGlance['steps'] = null;
  if (input.steps) {
    const byDate = new Map(input.steps.map((s) => [s.date, s.value]));
    const days = Array.from({ length: 7 }, (_, i) => byDate.get(addDays(today, i - 6)) ?? null);
    const known = days.filter((d) => d !== null).length;
    const todaySteps = byDate.get(today) ?? null;
    if (todaySteps !== null || known > 0) steps = { today: todaySteps, days: known >= MIN_STEP_DAYS ? days : null };
  }

  const weight =
    input.weight?.currentAvgKg != null && input.bodyOrder.includes('weight')
      ? { kg: input.weight.currentAvgKg, changeKg: input.weight.changeKg }
      : null;

  return { nutrition, week: weekStrip(input.week, today), steps, weight };
}
