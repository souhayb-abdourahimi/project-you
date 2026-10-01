/**
 * Progress Journey, the "Mon évolution" screen (docs/PROGRESS_JOURNEY.md): the user's story since
 * the start, told only with recorded values. A missing value is said to be missing (`notes`);
 * nothing is estimated (no muscle, fat, calories burned or body-fat percentage, CLAUDE.md rule 7).
 */
import type { GoalType } from '../profile/schemas';
import { addDays, daysBetween, startOfWeek, type IsoDate } from '../shared/dates';
import { adherence, type Adherence, type AdherenceInput } from './adherence';
import {
  checkpointPath,
  milestonesReached,
  type Checkpoint,
  type MilestoneInput,
  type MilestoneStatus,
} from './milestones';
import {
  activeDates,
  exerciseTrends,
  personalRecords,
  sessionsPerWeek,
  startWeight,
  weekStreak,
  weeksSince,
  weightAverageAt,
  type ExerciseTrend,
  type PersonalRecord,
} from './progress-facts';

export type ProgressSection = 'since_start' | 'body' | 'performance' | 'habits';
export type BodyBlock = 'waist' | 'performance' | 'photos' | 'consistency' | 'weight';

export interface ProgressNote {
  key: string;
  params?: Record<string, string | number>;
}

export interface ProgressJourney {
  startedOn: IsoDate;
  /** True on the very first day with nothing recorded yet ("Ton histoire commence aujourd'hui"). */
  empty: boolean;
  sinceStart: {
    days: number;
    activeDays: number;
    sessions: number;
    regularity: { weeksWithSession: number; weeks: number; streakWeeks: number };
    adherence: Adherence | null;
  };
  body: {
    weight: { startAvgKg: number | null; currentAvgKg: number | null; changeKg: number | null; entries: number } | null;
    waist: { startCm: number; currentCm: number; changeCm: number | null } | null;
    others: { kind: string; startCm: number; currentCm: number; changeCm: number | null }[];
    /** Not built (Storage policies missing): the section stays hidden. */
    photos: null;
  };
  performance: { records: PersonalRecord[]; exercises: ExerciseTrend[] };
  habits: {
    trainingWeeks: number;
    mealsLoggedDays: number;
    activityDays: number;
    weighInWeeks: number;
    checkins: number;
  };
  milestones: MilestoneStatus[];
  path: Checkpoint[];
  order: ProgressSection[];
  bodyOrder: BodyBlock[];
  notes: ProgressNote[];
}

export interface ProgressJourneyInput extends MilestoneInput {
  /** For adherence: planned session dates and outcomes. Null when the plan is unknown. */
  adherence: Omit<AdherenceInput, 'today' | 'completedSessions' | 'meals'> | null;
}

/** Recomposition: weight stable within ±0.5 kg over 4 weeks (both averages measured). */
export const RECOMPOSITION = { stableKg: 0.5, windowDays: 28 } as const;

export function sectionOrder(goal: GoalType): ProgressSection[] {
  if (goal === 'performance' || goal === 'muscle_gain') return ['since_start', 'performance', 'body', 'habits'];
  if (goal === 'maintenance' || goal === 'fitness') return ['since_start', 'habits', 'performance', 'body'];
  return ['since_start', 'body', 'performance', 'habits'];
}

/** Weight is never the only indicator; in recomposition it comes last and smaller. */
export function bodyOrder(goal: GoalType): BodyBlock[] {
  switch (goal) {
    case 'recomposition':
      return ['waist', 'performance', 'photos', 'consistency', 'weight'];
    case 'fat_loss':
      return ['waist', 'weight', 'performance', 'consistency'];
    case 'weight_loss':
      return ['weight', 'waist', 'consistency'];
    case 'muscle_gain':
      return ['performance', 'weight', 'consistency'];
    case 'performance':
      return ['performance', 'consistency'];
    default:
      return ['consistency', 'performance', 'weight'];
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function series<T extends { date: IsoDate; cm: number }>(entries: T[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const first = sorted[0].cm;
  const last = sorted[sorted.length - 1].cm;
  return { startCm: first, currentCm: last, changeCm: sorted.length >= 2 ? round1(last - first) : null };
}

export function buildProgressJourney(input: ProgressJourneyInput): ProgressJourney {
  const { today, startedOn, goal, data } = input;
  const active = activeDates(data);
  const perWeek = sessionsPerWeek(data);
  const weeks = weeksSince(startedOn, today);

  const start = startWeight(data.weights);
  const lastWeigh = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const current = lastWeigh ? weightAverageAt(data.weights, lastWeigh.date, 1) : null;
  const weight =
    data.weights.length === 0
      ? null
      : {
          startAvgKg: start?.avgKg ?? null,
          currentAvgKg: current,
          // Compared only once the current week is past the reference week.
          changeKg:
            start && current !== null && lastWeigh && lastWeigh.date > start.until
              ? round1(current - start.avgKg)
              : null,
          entries: data.weights.length,
        };
  const waist = series(data.waist);
  const kinds = [...new Set(data.measurements.map((m) => m.kind))].sort();
  const others = kinds.map((kind) => ({ kind, ...series(data.measurements.filter((m) => m.kind === kind))! }));

  const records = personalRecords(data);
  const exercises = exerciseTrends(data);

  const notes: ProgressNote[] = [];
  const weightGoal = goal === 'fat_loss' || goal === 'weight_loss' || goal === 'muscle_gain';
  if (weightGoal && data.weights.length === 0) notes.push({ key: 'progress.note.no_weight' });
  if ((goal === 'recomposition' || goal === 'fat_loss') && data.waist.length === 0) {
    notes.push({ key: 'progress.note.no_waist' });
  }
  if (Object.keys(data.setLogs).length === 0 && data.completedSessions.length > 0) {
    notes.push({ key: 'progress.note.no_loads' });
  }
  if (goal === 'recomposition' && lastWeigh) {
    const now = weightAverageAt(data.weights, lastWeigh.date);
    const before = weightAverageAt(data.weights, addDays(lastWeigh.date, -RECOMPOSITION.windowDays));
    if (now !== null && before !== null && Math.abs(now - before) <= RECOMPOSITION.stableKg) {
      // Cites only what was measured; without a measured change, suggests measuring the waist.
      const up = exercises.filter((e) => e.trend === 'up').length;
      const waistChange = waist?.changeCm ?? 0;
      if (waistChange < 0) {
        notes.push({ key: 'progress.note.recomposition_waist', params: { cm: Math.abs(waistChange) } });
      } else if (up > 0) {
        notes.push({ key: 'progress.note.recomposition_loads', params: { count: up } });
      } else {
        notes.push({ key: 'progress.note.recomposition_measure' });
      }
    }
  }

  const loggedMealDays = new Set(data.meals.filter((m) => m.status !== 'planned').map((m) => m.date));
  const checkinDays = data.dayLogs.filter(
    (d) => d.energy !== undefined || d.motivation !== undefined || d.fatigue !== undefined,
  ).length;

  return {
    startedOn,
    empty: active.length === 0 && daysBetween(startedOn, today) === 0,
    sinceStart: {
      days: Math.max(0, daysBetween(startedOn, today)),
      activeDays: active.filter((d) => d <= today).length,
      sessions: data.completedSessions.length,
      regularity: {
        weeksWithSession: weeks.filter((w) => (perWeek.get(w)?.length ?? 0) > 0).length,
        weeks: weeks.length,
        streakWeeks: weekStreak(data, today),
      },
      adherence: input.adherence
        ? adherence({ ...input.adherence, today, completedSessions: data.completedSessions, meals: data.meals }, 28)
        : null,
    },
    body: { weight, waist, others, photos: null },
    performance: { records: [...records].reverse(), exercises },
    habits: {
      trainingWeeks: weeks.filter((w) => (perWeek.get(w)?.length ?? 0) > 0).length,
      mealsLoggedDays: loggedMealDays.size,
      activityDays: data.dayLogs.filter((d) => d.activity === 'walk' || d.activity === 'mobility').length,
      weighInWeeks: new Set(data.weights.map((w) => startOfWeek(w.date))).size,
      checkins: checkinDays + data.weeklyCheckins.length,
    },
    milestones: milestonesReached(input),
    path: checkpointPath(input),
    order: sectionOrder(goal),
    bodyOrder: bodyOrder(goal),
    notes,
  };
}
