/**
 * Calendar integration rules (docs/INTEGRATIONS.md). Pure functions:
 * - `busyFromEvents` turns the user's calendar events into busy slots for the PlanningEngine;
 * - `desiredAppEvents` lists the events Project You wants in its own calendar for a week;
 * - `planCalendarChanges` compares them with what the app already wrote.
 * The app only ever writes to its own calendar; personal events are read, never modified.
 */
import type { WeeklyPlan } from '../planning/engine';
import { addDays, formatTime, parseTime, toIsoDate, weekdayOf, type IsoDate, type Weekday } from '../shared/dates';

/** A calendar event as read from the device, reduced to what planning needs (no title). */
export interface CalendarBusyEvent {
  start: string;
  end: string;
  allDay: boolean;
}

export interface BusySlot {
  day: Weekday;
  start: string;
  end: string;
  label: 'calendar';
}

const DAY_MINUTES = 24 * 60;

/**
 * Busy slots of the week from calendar events (local time). All-day events (birthdays, holidays,
 * reminders) are ignored: they rarely block a 30-minute session, and the user keeps the last word.
 * Events crossing midnight are split; the slots never contain titles or any event details.
 */
export function busyFromEvents(events: CalendarBusyEvent[], weekStart: IsoDate): BusySlot[] {
  const weekEnd = addDays(weekStart, 6);
  const slots: BusySlot[] = [];
  for (const e of events) {
    if (e.allDay) continue;
    const start = new Date(e.start);
    const end = new Date(e.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    for (let day = toIsoDate(start); day <= toIsoDate(end) && day <= weekEnd; day = addDays(day, 1)) {
      if (day < weekStart) continue;
      const from = day === toIsoDate(start) ? start.getHours() * 60 + start.getMinutes() : 0;
      const to = day === toIsoDate(end) ? end.getHours() * 60 + end.getMinutes() : DAY_MINUTES;
      if (to <= from) continue;
      slots.push({
        day: weekdayOf(day),
        start: formatTime(from),
        end: to >= DAY_MINUTES ? '23:59' : formatTime(to),
        label: 'calendar',
      });
    }
  }
  return slots;
}

/** One event Project You wants in its calendar, identified by a stable key. */
export interface AppEventSpec {
  key: string;
  kind: 'workout' | 'meal_prep' | 'shopping';
  /** i18n key of the title; rendered by the caller. */
  titleKey: string;
  date: IsoDate;
  start: string;
  end: string;
}

/** Workouts with a time slot (and meal prep / shopping when asked) still ahead in the week. */
export function desiredAppEvents(
  plan: WeeklyPlan,
  options: { from: IsoDate; completed?: string[]; includeMealPrep?: boolean },
): AppEventSpec[] {
  const completed = new Set(options.completed ?? []);
  const out: AppEventSpec[] = [];
  for (const day of plan.days) {
    if (day.date < options.from) continue;
    for (const item of day.items) {
      if (item.kind === 'workout' && item.start && item.end && !completed.has(`${day.date}#${item.sessionIndex}`)) {
        out.push({
          key: `workout:${day.date}#${item.sessionIndex}`,
          kind: 'workout',
          titleKey: item.variant === 'short' ? 'calendar.events.workout_short' : 'calendar.events.workout',
          date: day.date,
          start: item.start,
          end: item.end,
        });
      }
      if (options.includeMealPrep && (item.kind === 'meal_prep' || item.kind === 'shopping')) {
        out.push({
          key: `${item.kind}:${day.date}`,
          kind: item.kind,
          titleKey: `calendar.events.${item.kind}`,
          date: day.date,
          start: item.start,
          end: item.end,
        });
      }
    }
  }
  return out;
}

/** What the app already wrote: key → event id in the app calendar + fingerprint of its content. */
export type WrittenEvents = Record<string, { eventId: string; hash: string; date: IsoDate }>;

export interface CalendarChanges {
  create: AppEventSpec[];
  update: { spec: AppEventSpec; eventId: string }[];
  /** Only ids the app wrote itself. */
  remove: { key: string; eventId: string }[];
}

export function eventHash(e: AppEventSpec): string {
  return `${e.titleKey}|${e.date}|${e.start}|${e.end}`;
}

/**
 * Diff between the desired events and those already written. Past events are left alone
 * (history stays in the calendar); upcoming ones that no longer exist in the plan are removed.
 */
export function planCalendarChanges(desired: AppEventSpec[], written: WrittenEvents, from: IsoDate): CalendarChanges {
  const changes: CalendarChanges = { create: [], update: [], remove: [] };
  const wanted = new Map(desired.map((d) => [d.key, d]));
  for (const spec of desired) {
    const existing = written[spec.key];
    if (!existing) changes.create.push(spec);
    else if (existing.hash !== eventHash(spec)) changes.update.push({ spec, eventId: existing.eventId });
  }
  for (const [key, w] of Object.entries(written)) {
    if (!wanted.has(key) && w.date >= from) changes.remove.push({ key, eventId: w.eventId });
  }
  return changes;
}

/** Start and end as local Date objects for a spec (the device calendar works in local time). */
export function specDates(spec: AppEventSpec): { start: Date; end: Date } {
  const [y, m, d] = spec.date.split('-').map(Number);
  const at = (time: string) => {
    const minutes = parseTime(time);
    return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  };
  return { start: at(spec.start), end: at(spec.end) };
}
