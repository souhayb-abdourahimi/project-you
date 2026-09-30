import type { ScheduleProfile, TrainingProfile } from '../profile/schemas';
import { addDays, formatTime, parseTime, type IsoDate, type Weekday } from '../shared/dates';
import type { Rationale } from '../shared/rationale';

export interface Interval {
  start: number;
  end: number;
}

export type SessionLocation = 'gym' | 'home';

export type PlanItem =
  | {
      kind: 'workout';
      sessionIndex: number;
      location: SessionLocation;
      /** `short` when only a 15–20 min slot exists that day. */
      variant: 'full' | 'short';
      start: string | null;
      end: string | null;
    }
  | { kind: 'rest' }
  | { kind: 'meal_prep'; start: string; end: string }
  | { kind: 'shopping'; start: string; end: string };

export interface PlannedDay {
  date: IsoDate;
  weekday: Weekday;
  items: PlanItem[];
}

export type PlanningWarning = 'needs_availability' | 'fewer_sessions_than_requested' | 'home_fallback_used';

export interface WeeklyPlan {
  weekStart: IsoDate;
  days: PlannedDay[];
  warnings: PlanningWarning[];
  rationale: Rationale;
}

export interface PlanningInput {
  weekStart: IsoDate;
  schedule: ScheduleProfile;
  training: Pick<TrainingProfile, 'sessionsPerWeek' | 'sessionMinutes' | 'hasGym' | 'gymTravelMinutes'>;
}

const SHORT_SESSION_MINUTES = 15;
const MEAL_PREP_MINUTES = 60;
const SHOPPING_MINUTES = 30;

/** Availability minus fixed constraints for one weekday, sorted, in minutes since midnight. */
export function freeIntervals(schedule: ScheduleProfile, day: Weekday): Interval[] {
  let free: Interval[] = schedule.availability
    .filter((s) => s.day === day)
    .map((s) => ({ start: parseTime(s.start), end: parseTime(s.end) }));
  for (const busy of schedule.fixedConstraints.filter((c) => c.day === day)) {
    const b = { start: parseTime(busy.start), end: parseTime(busy.end) };
    free = free.flatMap((f) => {
      if (b.end <= f.start || b.start >= f.end) return [f];
      const parts: Interval[] = [];
      if (b.start > f.start) parts.push({ start: f.start, end: b.start });
      if (b.end < f.end) parts.push({ start: b.end, end: f.end });
      return parts;
    });
  }
  return free.filter((f) => f.end > f.start).sort((a, b) => a.start - b.start);
}

function longest(intervals: Interval[]): Interval | null {
  return intervals.reduce<Interval | null>((best, i) => (!best || i.end - i.start > best.end - best.start ? i : best), null);
}

interface DayOption {
  day: Weekday;
  location: SessionLocation;
  variant: 'full' | 'short';
  quality: number;
  slot: Interval;
  travel: number;
}

function optionFor(day: Weekday, input: PlanningInput): DayOption | null {
  const slot = longest(freeIntervals(input.schedule, day));
  if (!slot) return null;
  const length = slot.end - slot.start;
  const minutes = input.training.sessionMinutes;
  const travel = input.training.gymTravelMinutes ?? 0;
  if (input.training.hasGym && length >= minutes + 2 * travel) {
    return { day, location: 'gym', variant: 'full', quality: 3, slot, travel };
  }
  if (length >= minutes) return { day, location: 'home', variant: 'full', quality: 2, slot, travel: 0 };
  if (length >= SHORT_SESSION_MINUTES) return { day, location: 'home', variant: 'short', quality: 1, slot, travel: 0 };
  return null;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

function spreadScore(days: DayOption[]): number {
  let score = days.reduce((s, d) => s + d.quality * 10, 0);
  for (let i = 1; i < days.length; i++) if (days[i].day - days[i - 1].day === 1) score -= 4;
  return score;
}

/** Days without explicit availability: spread sessions over the week with no times attached. */
const DEFAULT_SPREAD: Record<number, Weekday[]> = {
  1: [3],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

export function planWeek(input: PlanningInput): WeeklyPlan {
  const warnings: PlanningWarning[] = [];
  const weekdays: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
  const days: PlannedDay[] = weekdays.map((weekday) => ({ date: addDays(input.weekStart, weekday - 1), weekday, items: [] }));
  const requested = input.training.sessionsPerWeek;

  if (input.schedule.availability.length === 0) {
    warnings.push('needs_availability');
    DEFAULT_SPREAD[requested].forEach((weekday, sessionIndex) => {
      days[weekday - 1].items.push({
        kind: 'workout',
        sessionIndex,
        location: input.training.hasGym ? 'gym' : 'home',
        variant: 'full',
        start: null,
        end: null,
      });
    });
  } else {
    const options = weekdays.map((d) => optionFor(d, input)).filter((o): o is DayOption => o !== null);
    const k = Math.min(requested, options.length);
    if (k < requested) warnings.push('fewer_sessions_than_requested');
    const best = combinations(options, k).reduce<DayOption[] | null>(
      (acc, combo) => (!acc || spreadScore(combo) > spreadScore(acc) ? combo : acc),
      null,
    );
    (best ?? []).forEach((option, sessionIndex) => {
      const start = option.slot.start + option.travel;
      const duration = option.variant === 'short' ? Math.min(20, option.slot.end - option.slot.start) : input.training.sessionMinutes;
      if (input.training.hasGym && option.location === 'home') warnings.push('home_fallback_used');
      days[option.day - 1].items.push({
        kind: 'workout',
        sessionIndex,
        location: option.location,
        variant: option.variant,
        start: formatTime(start),
        end: formatTime(start + duration),
      });
    });
    placeFoodTasks(days, input);
  }

  for (const day of days) if (!day.items.some((i) => i.kind === 'workout')) day.items.unshift({ kind: 'rest' });

  return {
    weekStart: input.weekStart,
    days,
    warnings: [...new Set(warnings)],
    rationale: {
      goal: 'planning.goal',
      constraints: ['planning.constraint.availability', 'planning.constraint.fixed', 'planning.constraint.recovery'],
      dataUsed: ['data.availability', 'data.constraints', 'data.frequency', 'data.duration', 'data.travel'],
      reason: 'planning.reason.fit_real_schedule',
    },
  };
}

/** Meal prep on the least busy non-training day with a free hour; shopping the day before when possible. */
function placeFoodTasks(days: PlannedDay[], input: PlanningInput): void {
  const trainingMinutes = input.training.sessionMinutes + 2 * (input.training.gymTravelMinutes ?? 0);
  const busyWith = (d: PlannedDay) => (d.items.some((i) => i.kind === 'workout') ? trainingMinutes : 0);
  const byFreeTime = days
    .map((d) => {
      const slot = longest(freeIntervals(input.schedule, d.weekday));
      return { d, slot, training: d.items.some((i) => i.kind === 'workout') };
    })
    .filter((x) => x.slot && x.slot.end - x.slot.start >= MEAL_PREP_MINUTES + busyWith(x.d))
    .sort((a, b) => Number(a.training) - Number(b.training) || a.d.weekday - b.d.weekday);
  const prep = byFreeTime[0];
  if (!prep?.slot) return;
  const prepStart = prep.slot.end - MEAL_PREP_MINUTES;
  prep.d.items.push({ kind: 'meal_prep', start: formatTime(prepStart), end: formatTime(prep.slot.end) });

  const before = days[prep.d.weekday - 2];
  const beforeSlot = before ? longest(freeIntervals(input.schedule, before.weekday)) : null;
  if (before && beforeSlot && beforeSlot.end - beforeSlot.start >= SHOPPING_MINUTES + busyWith(before)) {
    before.items.push({ kind: 'shopping', start: formatTime(beforeSlot.end - SHOPPING_MINUTES), end: formatTime(beforeSlot.end) });
  } else if (prepStart - prep.slot.start >= SHOPPING_MINUTES + busyWith(prep.d)) {
    prep.d.items.push({ kind: 'shopping', start: formatTime(prepStart - SHOPPING_MINUTES), end: formatTime(prepStart) });
  }
}

/** "Report intelligent": next days (after `from`) with room for the session, full or short. */
export function rescheduleOptions(
  plan: WeeklyPlan,
  from: IsoDate,
  input: PlanningInput,
): { date: IsoDate; location: SessionLocation; variant: 'full' | 'short'; start: string }[] {
  return plan.days
    .filter((d) => d.date > from && !d.items.some((i) => i.kind === 'workout'))
    .map((d) => ({ d, option: optionFor(d.weekday, input) }))
    .filter((x): x is { d: PlannedDay; option: DayOption } => x.option !== null)
    .map(({ d, option }) => ({
      date: d.date,
      location: option.location,
      variant: option.variant,
      start: formatTime(option.slot.start + option.travel),
    }));
}
