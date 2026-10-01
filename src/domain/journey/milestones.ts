/**
 * Milestones and the intermediate path (docs/PROGRESS_JOURNEY.md §4–5). Few milestones, each with a
 * meaning and dated by the recorded data that proves it (`sourceRef`). Behaviour milestones
 * ("10 séances") weigh as much as body ones. A milestone is celebrated once, never while the safety
 * rule is active, never weeks later, and a weight drop is never celebrated for a protected profile.
 */
import type { GoalType } from '../profile/schemas';
import { addDays, daysBetween, startOfWeek, type IsoDate } from '../shared/dates';
import type { MilestoneRecord } from './outcomes';
import {
  activeDates,
  personalRecords,
  sessionDates,
  startWeight,
  streakReachedOn,
  weightAverageAt,
  type ProgressData,
} from './progress-facts';

export const MILESTONES = {
  sessionCounts: [10, 25, 50, 100],
  activeDays: 30,
  weekStreaks: [8, 12],
  waistImprovementCm: 1,
  weightImprovementKg: 1,
  weightImprovementPct: 1,
  goalWeightToleranceKg: 0.5,
  /** A milestone reached longer ago than this is recorded but no longer celebrated. */
  celebrateWithinDays: 7,
} as const;

export interface MilestoneInput {
  today: IsoDate;
  startedOn: IsoDate;
  goal: GoalType;
  targetWeightKg?: number | null;
  targetDate?: IsoDate | null;
  plannedSessionsPerWeek: number;
  /** Minor or underweight (journey state `profile.noPush`). */
  noPush: boolean;
  data: ProgressData;
}

export interface MilestoneStatus {
  id: string;
  reachedOn: IsoDate;
  /** The recorded data that proves it, e.g. `session:2026-09-29`, `waist:2026-10-12`. */
  sourceRef: string;
}

/** Waist down (loss, recomposition) or 7-day weight average towards the goal, both measured. */
function measuredImprovement(input: MilestoneInput): MilestoneStatus | null {
  const { goal, data, noPush } = input;
  const candidates: MilestoneStatus[] = [];
  const losing = goal === 'fat_loss' || goal === 'weight_loss' || goal === 'recomposition';
  // A protected profile is never congratulated on getting smaller or lighter.
  if (losing && !noPush) {
    const waist = [...data.waist].sort((a, b) => a.date.localeCompare(b.date));
    const first = waist[0];
    const better = first && waist.find((w) => w.cm <= first.cm - MILESTONES.waistImprovementCm);
    if (better)
      candidates.push({ id: 'first_measured_improvement', reachedOn: better.date, sourceRef: `waist:${better.date}` });
  }
  const direction = goal === 'fat_loss' || goal === 'weight_loss' ? -1 : goal === 'muscle_gain' ? 1 : 0;
  const start = startWeight(data.weights);
  if (direction !== 0 && start && !(direction < 0 && noPush)) {
    const needed = Math.max(MILESTONES.weightImprovementKg, (start.avgKg * MILESTONES.weightImprovementPct) / 100);
    const later = [...data.weights].filter((w) => w.date > start.until).sort((a, b) => a.date.localeCompare(b.date));
    for (const w of later) {
      const avg = weightAverageAt(data.weights, w.date);
      if (avg !== null && (avg - start.avgKg) * direction >= needed - 1e-9) {
        candidates.push({ id: 'first_measured_improvement', reachedOn: w.date, sourceRef: `weight:${w.date}` });
        break;
      }
    }
  }
  return candidates.sort((a, b) => a.reachedOn.localeCompare(b.reachedOn))[0] ?? null;
}

function goalWeight(input: MilestoneInput): MilestoneStatus | null {
  const target = input.targetWeightKg;
  if (!target) return null;
  const start = startWeight(input.data.weights);
  // Never celebrate reaching a lower weight for a protected profile.
  if (input.noPush && (!start || target < start.avgKg)) return null;
  for (const w of [...input.data.weights].sort((a, b) => a.date.localeCompare(b.date))) {
    const avg = weightAverageAt(input.data.weights, w.date);
    if (avg !== null && Math.abs(avg - target) <= MILESTONES.goalWeightToleranceKg) {
      return { id: 'weight_goal_reached', reachedOn: w.date, sourceRef: `weight:${w.date}` };
    }
  }
  return null;
}

export type CheckpointKey = 'regularity' | 'sessions_10' | 'first_progress' | 'performance_up' | 'midway_review';

export interface Checkpoint {
  step: 1 | 2 | 3 | 4 | 5;
  key: CheckpointKey;
  /** A landmark for ordering and "soon": never a deadline, never "missed". */
  dueOn: IsoDate;
  reachedOn: IsoDate | null;
  status: 'reached' | 'current' | 'upcoming';
}

/** The 5-step intermediate path towards a goal of several months (§5). */
export function checkpointPath(input: MilestoneInput): Checkpoint[] {
  const { startedOn, data } = input;
  const quota = Math.max(1, Math.min(2, input.plannedSessionsPerWeek));
  const sessions = sessionDates(data);
  const records = personalRecords(data);
  const improvement =
    input.goal === 'performance' || input.goal === 'fitness' || input.goal === 'maintenance'
      ? (records[0]?.date ?? null)
      : (measuredImprovement(input)?.reachedOn ?? null);
  const midway =
    input.targetDate && input.targetDate > startedOn
      ? addDays(startedOn, Math.floor(daysBetween(startedOn, input.targetDate) / 2))
      : addDays(startedOn, 84);
  const review = data.weeklyCheckins
    .filter((c) => addDays(c.weekStart, 6) >= midway && c.weekStart <= addDays(startOfWeek(midway), 7))
    .map((c) => c.answeredAt.slice(0, 10))
    .sort()[0];

  const steps: Omit<Checkpoint, 'status'>[] = [
    { step: 1, key: 'regularity', dueOn: addDays(startedOn, 30), reachedOn: streakReachedOn(data, 4, quota) },
    { step: 2, key: 'sessions_10', dueOn: addDays(startedOn, 35), reachedOn: sessions[9] ?? null },
    { step: 3, key: 'first_progress', dueOn: addDays(startedOn, 42), reachedOn: improvement },
    {
      step: 4,
      key: 'performance_up',
      dueOn: addDays(startedOn, 56),
      reachedOn: records.find((r) => r.date >= addDays(startedOn, 14))?.date ?? null,
    },
    { step: 5, key: 'midway_review', dueOn: midway, reachedOn: review && review >= midway ? review : null },
  ];
  let currentGiven = false;
  return steps.map((s) => {
    if (s.reachedOn) return { ...s, status: 'reached' };
    const status = currentGiven ? 'upcoming' : 'current';
    currentGiven = true;
    return { ...s, status };
  });
}

/** Every milestone reached so far, dated, oldest first. */
export function milestonesReached(input: MilestoneInput): MilestoneStatus[] {
  const { data, startedOn, today } = input;
  const out: MilestoneStatus[] = [];
  const sessions = sessionDates(data);
  if (sessions[0]) out.push({ id: 'first_session', reachedOn: sessions[0], sourceRef: `session:${sessions[0]}` });
  for (const n of MILESTONES.sessionCounts) {
    const date = sessions[n - 1];
    if (date) out.push({ id: `sessions_${n}`, reachedOn: date, sourceRef: `session:${date}` });
  }
  const active = activeDates(data);
  const weekEnd = addDays(startedOn, 7);
  if (today >= weekEnd && active.some((d) => d <= weekEnd)) {
    out.push({ id: 'first_week', reachedOn: weekEnd, sourceRef: `days:${active.filter((d) => d <= weekEnd).length}` });
  }
  const nth = active[MILESTONES.activeDays - 1];
  if (nth)
    out.push({
      id: `active_days_${MILESTONES.activeDays}`,
      reachedOn: nth,
      sourceRef: `days:${MILESTONES.activeDays}`,
    });
  const month = streakReachedOn(data, 4);
  if (month) out.push({ id: 'first_month', reachedOn: month, sourceRef: `session:${month}` });
  for (const n of MILESTONES.weekStreaks) {
    const date = streakReachedOn(data, n);
    if (date) out.push({ id: `weeks_streak_${n}`, reachedOn: date, sourceRef: `session:${date}` });
  }
  const record = personalRecords(data)[0];
  if (record) {
    out.push({ id: 'first_record', reachedOn: record.date, sourceRef: `record:${record.exerciseId}:${record.date}` });
  }
  const improvement = measuredImprovement(input);
  if (improvement) out.push(improvement);
  const goal = goalWeight(input);
  if (goal) out.push(goal);
  for (const c of checkpointPath(input)) {
    if (c.reachedOn) out.push({ id: `checkpoint_${c.step}`, reachedOn: c.reachedOn, sourceRef: `checkpoint:${c.key}` });
  }
  return out.filter((m) => m.reachedOn <= today).sort((a, b) => a.reachedOn.localeCompare(b.reachedOn));
}

/** Message facts naming the milestone (voice catalog `milestone_reached` titles). */
export function milestoneFacts(id: string): Record<string, string> {
  if (id === 'first_session' || id === 'first_week') return { [id]: '1' };
  const count = /^(sessions|active_days|weeks_streak)_(\d+)$/.exec(id);
  if (count) return { [count[1] === 'weeks_streak' ? 'weeks' : count[1]]: count[2] };
  if (id === 'first_month') return { weeks: '4' };
  if (id === 'first_record') return { record: '1' };
  if (id === 'first_measured_improvement') return { improvement: '1' };
  if (id === 'weight_goal_reached') return { goal_weight: '1' };
  const checkpoint = /^checkpoint_(\d)$/.exec(id);
  if (checkpoint) return { checkpoint: checkpoint[1] };
  return {};
}

/** Behaviour first when two milestones land the same day: the most meaningful one is celebrated. */
const CELEBRATION_ORDER = [
  'weight_goal_reached',
  'checkpoint_',
  'first_measured_improvement',
  'first_record',
  'sessions_',
  'weeks_streak_',
  'first_month',
  'active_days_',
  'first_week',
  'first_session',
];
const rank = (id: string) => {
  const i = CELEBRATION_ORDER.findIndex((p) => (p.endsWith('_') ? id.startsWith(p) : id === p));
  return i === -1 ? CELEBRATION_ORDER.length : i;
};

/**
 * The one milestone to celebrate today, or null: not celebrated yet (on any device), reached within
 * the last 7 days, and never while the safety rule is active (it stays recorded, uncelebrated).
 */
export function milestoneToCelebrate(input: {
  today: IsoDate;
  reached: MilestoneStatus[];
  records: Record<string, MilestoneRecord>;
  safetyActive: boolean;
}): MilestoneStatus | null {
  if (input.safetyActive) return null;
  const candidates = input.reached.filter(
    (m) =>
      !input.records[m.id]?.celebratedAt &&
      daysBetween(m.reachedOn, input.today) <= MILESTONES.celebrateWithinDays &&
      m.reachedOn <= input.today,
  );
  return candidates.sort((a, b) => b.reachedOn.localeCompare(a.reachedOn) || rank(a.id) - rank(b.id))[0] ?? null;
}
