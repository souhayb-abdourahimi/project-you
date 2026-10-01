/**
 * Anti-abandon (docs/RETENTION.md §1): a deterministic risk score, recomputed on every opening,
 * never stored, never shown, never sent to the server. Its effects are never punitive: a lighter
 * day at `watch`, an offer to lighten two weeks or pause at `act`. `low_logging` (D-027) is an
 * engagement signal of its own and is not part of this score.
 */
import { addDays, daysBetween, startOfWeek, type IsoDate } from '../shared/dates';
import type { DayLog, SessionOutcome } from './outcomes';

export const RETENTION = {
  watch: 30,
  act: 55,
  weights: {
    missed_sessions: 25,
    absence: 30,
    long_absence: 45,
    low_motivation: 20,
    high_fatigue: 15,
    plateau: 15,
    checkin_skipped: 10,
    notifications_ignored: 10,
  },
  missedSessions: 2,
  absenceDays: 3,
  longAbsenceDays: 7,
  lowLevel: 2,
  lowMotivationDays: 2,
  highFatigue: 4,
  highFatigueDays: 3,
  heavyRpe: 9,
  ignoredInARow: 5,
} as const;

export type RiskSignal =
  | 'missed_sessions'
  | 'absence'
  | 'low_motivation'
  | 'high_fatigue'
  | 'plateau'
  | 'checkin_skipped'
  | 'notifications_ignored';

export interface RetentionInput {
  today: IsoDate;
  startedOn: IsoDate;
  plannedSessionDates: IsoDate[];
  completedDates: IsoDate[];
  /** Keyed `${date}#${sessionIndex}`. */
  sessionOutcomes: Record<string, SessionOutcome>;
  /** Last day with any recorded activity, today excluded; null when none. */
  lastActivityBeforeToday: IsoDate | null;
  dayLogs: DayLog[];
  weeklyCheckins: { weekStart: IsoDate; weekRating: number; answeredAt: string }[];
  /** Average RPE of the last 7 days, null without RPE. */
  recentRpe: number | null;
  plateau: boolean;
  /** Coach notifications scheduled in a row without being opened. */
  ignoredInARow: number;
}

export interface RetentionRisk {
  score: number;
  level: 'none' | 'watch' | 'act';
  signals: RiskSignal[];
}

export function retentionRisk(input: RetentionInput): RetentionRisk {
  const { today } = input;
  const week = (d: IsoDate) => d > addDays(today, -7) && d <= today;
  const signals: { signal: RiskSignal; weight: number }[] = [];
  const W = RETENTION.weights;

  const replaced = new Set(
    Object.entries(input.sessionOutcomes)
      .filter(([, o]) => o.status === 'replaced')
      .map(([k]) => k.split('#')[0]),
  );
  const done = new Set(input.completedDates);
  const missed = input.plannedSessionDates.filter(
    (d) => week(d) && d < today && !done.has(d) && !replaced.has(d),
  ).length;
  if (missed >= RETENTION.missedSessions) signals.push({ signal: 'missed_sessions', weight: W.missed_sessions });

  const away = input.lastActivityBeforeToday ? daysBetween(input.lastActivityBeforeToday, today) : 0;
  if (away >= RETENTION.longAbsenceDays) signals.push({ signal: 'absence', weight: W.long_absence });
  else if (away >= RETENTION.absenceDays) signals.push({ signal: 'absence', weight: W.absence });

  const recentLogs = input.dayLogs.filter((d) => week(d.date));
  const lastWeekly = [...input.weeklyCheckins].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).at(-1);
  const lowWeek =
    !!lastWeekly && week(lastWeekly.answeredAt.slice(0, 10)) && lastWeekly.weekRating <= RETENTION.lowLevel;
  if (
    recentLogs.filter((d) => (d.motivation ?? 5) <= RETENTION.lowLevel).length >= RETENTION.lowMotivationDays ||
    lowWeek
  ) {
    signals.push({ signal: 'low_motivation', weight: W.low_motivation });
  }

  if (
    recentLogs.filter((d) => (d.fatigue ?? 0) >= RETENTION.highFatigue).length >= RETENTION.highFatigueDays ||
    (input.recentRpe ?? 0) >= RETENTION.heavyRpe
  ) {
    signals.push({ signal: 'high_fatigue', weight: W.high_fatigue });
  }

  if (input.plateau) signals.push({ signal: 'plateau', weight: W.plateau });

  // The two last weeks whose check-in window has closed (it stays open until Tuesday).
  const closed = addDays(startOfWeek(addDays(today, -2)), -7);
  const lastTwo = [addDays(closed, -7), closed].filter((w) => w >= startOfWeek(input.startedOn));
  const answered = new Set(input.weeklyCheckins.map((c) => c.weekStart));
  if (lastTwo.length === 2 && lastTwo.every((w) => !answered.has(w))) {
    signals.push({ signal: 'checkin_skipped', weight: W.checkin_skipped });
  }

  if (input.ignoredInARow >= RETENTION.ignoredInARow) {
    signals.push({ signal: 'notifications_ignored', weight: W.notifications_ignored });
  }

  const score = signals.reduce((s, x) => s + x.weight, 0);
  return {
    score,
    level: score >= RETENTION.act ? 'act' : score >= RETENTION.watch ? 'watch' : 'none',
    signals: signals.map((s) => s.signal),
  };
}
