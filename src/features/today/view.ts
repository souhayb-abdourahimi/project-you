/**
 * View model of the Today screen (W-9): how the decisions already taken by the domain are laid out.
 * Nothing here decides what leads (coachDay does), recomputes a target or invents a value: it only
 * picks the words and the few numbers the screen shows, from the plan, the journey and real data.
 */
import type { DailyItem } from '@/domain/journey/daily-plan';
import type { BodyBlock } from '@/domain/journey/progress-journey';
import type { PlannedMeal } from '@/domain/meals/planner';
import type { WeekComparison } from '@/domain/training/compare';

/** The few lines under the hero's title: planned facts only. */
export type HeroChip =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'variant'; variant: 'short' | 'light' }
  | { kind: 'start'; time: string };

export interface HeroContent {
  /** The hero's title: the focus of a session, else the item's own line (itemLabel). */
  focus: string | null;
  chips: HeroChip[];
  /** The graphite surface is kept for a session to do; a calmer day stays light. */
  tone: 'inverse' | 'surface';
}

export function heroContent(item: DailyItem): HeroContent {
  const p = item.params;
  const chips: HeroChip[] = [];
  const minutes = Number(p.minutes);
  if (item.kind === 'workout' && item.status === 'todo') {
    if (Number.isFinite(minutes) && minutes > 0) chips.push({ kind: 'minutes', minutes });
    if (p.variant === 'short' || p.variant === 'light') chips.push({ kind: 'variant', variant: p.variant });
    if (typeof p.start === 'string' && p.start) chips.push({ kind: 'start', time: p.start });
    return { focus: typeof p.focus === 'string' ? p.focus : null, chips, tone: 'inverse' };
  }
  return { focus: null, chips, tone: 'surface' };
}

export type SnapshotMetric =
  | { id: 'sessions'; done: number; planned: number }
  | { id: 'protein'; eatenG: number; targetG: number }
  | { id: 'steps'; steps: number }
  | { id: 'weight'; kg: number };

/** At most three small numbers: a glance, never a dashboard. */
export const MAX_SNAPSHOT = 3;

export interface SnapshotInput {
  /** This week's training, planned vs done (compareWeek). */
  week: WeekComparison;
  /** Today's planned meals; null without a meal plan. */
  meals: readonly PlannedMeal[] | null;
  proteinTargetG: number;
  /** Steps measured today by the phone (Apple Health / Health Connect), null when not shared. */
  stepsToday: number | null;
  /** Recent average of the real weigh-ins (Progress Journey), null without any. */
  weightAvgKg: number | null;
  /** Body blocks the goal shows (bodyOrder): weight is never pushed when the goal hides it. */
  bodyOrder: readonly BodyBlock[];
}

export function todaySnapshot(input: SnapshotInput): SnapshotMetric[] {
  const out: SnapshotMetric[] = [];
  const { week } = input;
  // A week whose prescriptions are unknown has no honest denominator (W-7.1).
  if (week.planned > 0 && !week.prescriptionUnknown)
    out.push({ id: 'sessions', done: week.done, planned: week.planned });
  if (input.meals && input.meals.length > 0 && input.proteinTargetG > 0) {
    // Meals the user marked as eaten, with their planned values (the same estimate as Nutrition).
    const eaten = input.meals.filter((m) => m.status === 'eaten').reduce((s, m) => s + m.nutrition.proteinG, 0);
    out.push({ id: 'protein', eatenG: Math.round(eaten), targetG: Math.round(input.proteinTargetG) });
  }
  if (input.stepsToday !== null) out.push({ id: 'steps', steps: input.stepsToday });
  else if (input.weightAvgKg !== null && input.bodyOrder.includes('weight'))
    out.push({ id: 'weight', kg: input.weightAvgKg });
  return out.slice(0, MAX_SNAPSHOT);
}
