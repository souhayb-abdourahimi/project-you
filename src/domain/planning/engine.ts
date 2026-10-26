import type { LabeledSlot, ScheduleProfile, TimeSlot, TrainingProfile } from '../profile/schemas';
import { addDays, formatTime, parseTime, type IsoDate, type Weekday } from '../shared/dates';
import type { Rationale } from '../shared/rationale';
import { SESSION_DURATION } from '../training/durations';

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

export type PlanningWarning =
  | 'needs_availability'
  | 'fewer_sessions_than_requested'
  | 'home_fallback_used'
  /** A calendar is active but none of its free times this week is long enough for a session. */
  | 'no_free_slot';

/**
 * Where the frame of the week came from: the user's own availability, the automatic window around
 * an active calendar (no availability entered), or nothing (sessions without a time).
 */
export type AvailabilitySource = 'manual' | 'calendar_auto' | 'none';

export interface WeeklyPlan {
  weekStart: IsoDate;
  availability: AvailabilitySource;
  days: PlannedDay[];
  warnings: PlanningWarning[];
  rationale: Rationale;
}

export interface PlanningInput {
  weekStart: IsoDate;
  schedule: ScheduleProfile;
  training: Pick<TrainingProfile, 'sessionsPerWeek' | 'sessionMinutes' | 'hasGym' | 'gymTravelMinutes'>;
  /**
   * An active calendar (device calendar or iCal link, D-049) and its busy times this week: times
   * only, never a title. Present, even with no busy time, means a calendar is active.
   */
  calendar?: { busy: LabeledSlot[] };
}

/** The automatic frame used around an active calendar when no availability was entered (D-050). */
export const AUTO_WINDOW = { start: '07:00', end: '22:00' } as const;

/**
 * The availability the planner works in, never written back to the profile (D-050): the user's own
 * when entered (it always wins), else 07:00–22:00 every day when a calendar is active (its busy
 * times are then subtracted), else none.
 */
export function effectiveAvailability(
  schedule: Pick<ScheduleProfile, 'availability'>,
  calendarActive: boolean,
): { source: AvailabilitySource; availability: TimeSlot[] } {
  if (schedule.availability.length > 0) return { source: 'manual', availability: schedule.availability };
  if (!calendarActive) return { source: 'none', availability: [] };
  return {
    source: 'calendar_auto',
    availability: ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((day) => ({ day, ...AUTO_WINDOW })),
  };
}

/** The schedule the planner reads: effective availability, fixed constraints plus calendar busy times. */
function effectiveSchedule(input: PlanningInput): { source: AvailabilitySource; schedule: ScheduleProfile } {
  const { source, availability } = effectiveAvailability(input.schedule, input.calendar !== undefined);
  return {
    source,
    schedule: { availability, fixedConstraints: [...input.schedule.fixedConstraints, ...(input.calendar?.busy ?? [])] },
  };
}

const SHORT_SESSION_MINUTES = SESSION_DURATION.short;
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
  return intervals.reduce<Interval | null>(
    (best, i) => (!best || i.end - i.start > best.end - best.start ? i : best),
    null,
  );
}

interface DayOption {
  day: Weekday;
  location: SessionLocation;
  variant: 'full' | 'short';
  /** 3 gym with travel and full length, 2 home full length, 1 short session. */
  quality: number;
  /** 0..1: room left around the session in its free time (a tight fit is the last resort). */
  comfort: number;
  slot: Interval;
  travel: number;
  /** Session start and end, in minutes (travel excluded). */
  start: number;
  end: number;
}

/** Room around a session that makes a free time comfortable rather than exactly tight. */
const COMFORT_MINUTES = 30;

/**
 * Where a session goes inside a free time: right after its start (the user's own availability, as
 * before), or in its middle in the automatic window, so there is room on both sides of the
 * calendar's events. Rounded to 5 minutes, always inside the free time with the travel around it.
 */
function placeIn(slot: Interval, needed: number, travel: number, centred: boolean): number {
  if (!centred) return slot.start + travel;
  const slack = slot.end - slot.start - needed;
  return slot.start + travel + Math.floor(slack / 2 / 5) * 5;
}

function optionInSlot(
  day: Weekday,
  slot: Interval,
  input: PlanningInput,
  centred: boolean,
): DayOption | null {
  const length = slot.end - slot.start;
  const minutes = input.training.sessionMinutes;
  const travel = input.training.gymTravelMinutes ?? 0;
  const make = (location: SessionLocation, variant: 'full' | 'short', quality: number, t: number, duration: number) => {
    const needed = duration + 2 * t;
    const start = placeIn(slot, needed, t, centred);
    return {
      day,
      location,
      variant,
      quality,
      comfort: Math.min(length - needed, COMFORT_MINUTES) / COMFORT_MINUTES,
      slot,
      travel: t,
      start,
      end: start + duration,
    };
  };
  if (input.training.hasGym && length >= minutes + 2 * travel) return make('gym', 'full', 3, travel, minutes);
  if (length >= minutes) return make('home', 'full', 2, 0, minutes);
  if (length >= SHORT_SESSION_MINUTES) return make('home', 'short', 1, 0, Math.min(20, length));
  return null;
}

/**
 * The best free time of a day: gym with travel and full length > home > short session, then the
 * most comfortable one, then the earliest (deterministic: the same week always gives the same plan).
 */
function optionFor(day: Weekday, input: PlanningInput, schedule: ScheduleProfile, centred: boolean): DayOption | null {
  let best: DayOption | null = null;
  for (const slot of freeIntervals(schedule, day)) {
    const o = optionInSlot(day, slot, input, centred);
    if (o && (!best || o.quality > best.quality || (o.quality === best.quality && o.comfort > best.comfort))) best = o;
  }
  return best;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

function spreadScore(days: DayOption[]): number {
  let score = days.reduce((s, d) => s + d.quality * 10 + d.comfort * 2, 0);
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
  const days: PlannedDay[] = weekdays.map((weekday) => ({
    date: addDays(input.weekStart, weekday - 1),
    weekday,
    items: [],
  }));
  const requested = input.training.sessionsPerWeek;
  const { source, schedule } = effectiveSchedule(input);

  if (source === 'none') {
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
    const centred = source === 'calendar_auto';
    const options = weekdays
      .map((d) => optionFor(d, input, schedule, centred))
      .filter((o): o is DayOption => o !== null);
    const k = Math.min(requested, options.length);
    // Never a time that is not free: what does not fit is said, not invented.
    if (k < requested) warnings.push(k === 0 && input.calendar ? 'no_free_slot' : 'fewer_sessions_than_requested');
    const best = combinations(options, k).reduce<DayOption[] | null>(
      (acc, combo) => (!acc || spreadScore(combo) > spreadScore(acc) ? combo : acc),
      null,
    );
    (best ?? []).forEach((option, sessionIndex) => {
      if (input.training.hasGym && option.location === 'home') warnings.push('home_fallback_used');
      days[option.day - 1].items.push({
        kind: 'workout',
        sessionIndex,
        location: option.location,
        variant: option.variant,
        start: formatTime(option.start),
        end: formatTime(option.end),
      });
    });
    // Meal prep and shopping keep following the user's own availability only.
    if (source === 'manual') placeFoodTasks(days, input, schedule);
  }

  for (const day of days) if (!day.items.some((i) => i.kind === 'workout')) day.items.unshift({ kind: 'rest' });

  return {
    weekStart: input.weekStart,
    availability: source,
    days,
    warnings: [...new Set(warnings)],
    rationale: {
      goal: 'planning.goal',
      constraints: ['planning.constraint.availability', 'planning.constraint.fixed', 'planning.constraint.recovery'],
      dataUsed:
        source === 'calendar_auto'
          ? ['data.calendar_busy', 'data.constraints', 'data.frequency', 'data.duration', 'data.travel']
          : ['data.availability', 'data.constraints', 'data.frequency', 'data.duration', 'data.travel'],
      reason: source === 'calendar_auto' ? 'planning.reason.calendar_gaps' : 'planning.reason.fit_real_schedule',
    },
  };
}

/** Meal prep on the least busy non-training day with a free hour; shopping the day before when possible. */
function placeFoodTasks(days: PlannedDay[], input: PlanningInput, schedule: ScheduleProfile): void {
  const trainingMinutes = input.training.sessionMinutes + 2 * (input.training.gymTravelMinutes ?? 0);
  const busyWith = (d: PlannedDay) => (d.items.some((i) => i.kind === 'workout') ? trainingMinutes : 0);
  const byFreeTime = days
    .map((d) => {
      const slot = longest(freeIntervals(schedule, d.weekday));
      return { d, slot, training: d.items.some((i) => i.kind === 'workout') };
    })
    .filter((x) => x.slot && x.slot.end - x.slot.start >= MEAL_PREP_MINUTES + busyWith(x.d))
    .sort((a, b) => Number(a.training) - Number(b.training) || a.d.weekday - b.d.weekday);
  const prep = byFreeTime[0];
  if (!prep?.slot) return;
  const prepStart = prep.slot.end - MEAL_PREP_MINUTES;
  prep.d.items.push({ kind: 'meal_prep', start: formatTime(prepStart), end: formatTime(prep.slot.end) });

  const before = days[prep.d.weekday - 2];
  const beforeSlot = before ? longest(freeIntervals(schedule, before.weekday)) : null;
  if (before && beforeSlot && beforeSlot.end - beforeSlot.start >= SHOPPING_MINUTES + busyWith(before)) {
    before.items.push({
      kind: 'shopping',
      start: formatTime(beforeSlot.end - SHOPPING_MINUTES),
      end: formatTime(beforeSlot.end),
    });
  } else if (prepStart - prep.slot.start >= SHOPPING_MINUTES + busyWith(prep.d)) {
    prep.d.items.push({
      kind: 'shopping',
      start: formatTime(prepStart - SHOPPING_MINUTES),
      end: formatTime(prepStart),
    });
  }
}

/** "Report intelligent": next days (after `from`) with room for the session, full or short. */
export function rescheduleOptions(
  plan: WeeklyPlan,
  from: IsoDate,
  input: PlanningInput,
): { date: IsoDate; location: SessionLocation; variant: 'full' | 'short'; start: string }[] {
  const { source, schedule } = effectiveSchedule(input);
  if (source === 'none') return [];
  return plan.days
    .filter((d) => d.date > from && !d.items.some((i) => i.kind === 'workout'))
    .map((d) => ({ d, option: optionFor(d.weekday, input, schedule, source === 'calendar_auto') }))
    .filter((x): x is { d: PlannedDay; option: DayOption } => x.option !== null)
    .map(({ d, option }) => ({
      date: d.date,
      location: option.location,
      variant: option.variant,
      start: formatTime(option.start),
    }));
}
