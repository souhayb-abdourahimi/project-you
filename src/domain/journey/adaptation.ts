/**
 * Adaptation Engine (docs/ADAPTATION_ENGINE.md §5–6): data → rules → recommendation → explanation.
 * Every recommendation carries the exact change, the reason shown to the user and the data used.
 * Calories and the number of sessions are only ever *proposed*: nothing changes without a gesture.
 * Rules are evaluated in order; the first that blocks calorie changes is said to the user.
 */
import type { GoalType } from '../profile/schemas';
import { addDays, daysBetween, startOfWeek, weekdayOf, type IsoDate } from '../shared/dates';
import { getExercise } from '../training/exercises';
import type { LoggedSet, ProgressionRecommendation } from '../training/progression';
import { isStructural, STRUCTURE, type CycleOption } from '../training/structure';
import type { Adherence } from './adherence';
import {
  decidedRecommendation,
  effectiveDecisions,
  proposalKey,
  type Adjustment,
  type AdaptationKind,
} from './adjustments';
import { lightWeek, restartDraft, structuralDrafts, type ProposalScope, type StructuralSignals } from './structural';
import type { DayLog } from './outcomes';
import type { ExerciseTrend } from './progress-facts';
import { weightAverageAt } from './progress-facts';
import { minimumKcal } from './weight-basis';
import type { SafetyFlag } from './safety';

/**
 * Change keys the app applies in one gesture (usePlan, useJourney). Every other recommendation is
 * advice: shown with its reason, nothing changes in the plan.
 */
export const APPLICABLE_CHANGES = [
  'calories_per_day',
  'sessions_per_week',
  'light_week',
  // W-5 (D-037): structural changes, each applied only on the user's explicit "yes".
  'restart',
  'reduce_volume',
  'easier_variant',
  'exercise_change',
  'cycle_review',
] as const;

/** Days a light week lasts from the day it is applied. */
export const LIGHT_WEEK_DAYS = STRUCTURE.lightWeekDays;

/** Design parameters, to be reviewed by a professional with those of D-024/D-026. */
export const ADAPTATION = {
  calibrationDays: 14,
  minWeighInsPer14Days: 6,
  maxKcalStep: 150,
  kcalStep: 120,
  smallKcalStep: 100,
  cooldownDays: 14,
  minAdherence: 0.7,
  lossTooSlowPct: 0.25,
  lossTooFastPct: 1,
  gainTooSlowPct: 0.1,
  gainTooFastPct: 0.75,
  recompLossTooFastPct: 0.5,
  maintenanceDriftKg: 1.5,
  gainCapOverMaintenance: 0.2,
  heavyRpe: 9,
  highFatigue: 4,
  highFatigueDays: 3,
  sameDayMoves: 2,
  plateauMinDays: 28,
  plateauWindowDays: 21,
  recompStableWaistCm: 1,
  backToPlanWeeks: 4,
} as const;

export type BlockReason = 'safety' | 'calibration' | 'not_enough_data' | 'cooldown' | 'low_adherence';

export interface Recommendation {
  /** `${kind}:${changeKey}:${weekStart}` (recommendationKey): one per change and week. */
  id: string;
  kind: AdaptationKind;
  change: { key: string; from?: number | string; to?: number | string };
  reason: { key: string; params: Record<string, string | number> };
  evidence: Record<string, string | number>;
  /** proposed: one gesture applies it; advice: no change to the plan. */
  mode: 'proposed' | 'advice';
  blockedBy?: BlockReason;
  /** The exercise(s) a structural proposal is about (W-5), comma-separated. */
  target?: string | null;
  /** How long it lasts once accepted (W-5): known before the user says yes. */
  scope?: ProposalScope | null;
  /** Answers to choose from (end-of-cycle review). */
  options?: CycleOption[];
}

export interface AdaptationInput {
  today: IsoDate;
  startedOn: IsoDate;
  goal: GoalType;
  safety: { active: boolean; flags: SafetyFlag[] };
  /** Adherence over 14 and 28 days (journey/adherence.ts). */
  adherence14: Adherence;
  adherence28: Adherence;
  /** Sessions done vs expected in each of the last two full weeks (oldest first). */
  missedPerWeek: [number, number];
  weights: { date: IsoDate; weightKg: number }[];
  waist: { date: IsoDate; cm: number }[];
  trends: ExerciseTrend[];
  setLogs: Record<string, Record<string, LoggedSet[]>>;
  dayLogs: DayLog[];
  /** Planned session moves (from → to). */
  rescheduled: Record<IsoDate, IsoDate>;
  /** Food spending of the last two full weeks (oldest first); null without a budget. */
  spending: [{ spentCents: number; budgetCents: number }, { spentCents: number; budgetCents: number }] | null;
  targets: { calories: number; floorKcal: number; maintenance: number };
  /** Minor or underweight (nutrition/engine.ts noDeficitProfile): never a deficit. */
  noDeficit?: boolean;
  /** Offset already applied (kcal/day). */
  calorieOffset: number;
  sessionsPerWeek: { profile: number; current: number };
  adjustments: Adjustment[];
  /** Exercises whose own history shows a plateau or a downward trend (training/progression.ts). */
  progression?: { stagnating: string[]; down: string[]; persistent?: string[] };
  /** Training facts for the structural rules (W-5, `journey/structural.ts`). */
  structural?: StructuralSignals;
}

/** Today's context for the progression of one exercise: one safety engine, one journey state. */
export interface ProgressionContext {
  safetyActive: boolean;
  /** Fatigue declared today: applies to today's session only. */
  fatigueHigh: boolean;
  /** Minor or underweight (journey state profile.noPush): never more intensity. */
  noPush: boolean;
  /** Structural change the user accepted, in force on the session's date (W-5). */
  structure?: 'light_week' | 'reduce_volume' | 'restart' | null;
  /** Date of the session being prescribed: after a long break, nothing goes up yet (W-5). */
  date?: IsoDate;
}

/** Exercises showing a downward trend before a lighter week is proposed. [relire] */
export const PERFORMANCE_DOWN_EXERCISES = 2;

/**
 * The progression engine proposes, this layer decides with today's context (D-035): under the
 * safety rule or a high declared fatigue, an increase becomes "keep" (the last real load and the
 * same goal); for a protected profile, the load never goes up (one more repetition within the
 * range stays possible). Keeping, retrying and decreasing always pass.
 */
export function gateProgression(rec: ProgressionRecommendation, ctx: ProgressionContext): ProgressionRecommendation {
  if (ctx.structure === 'restart' && rec.action !== 'no_recommendation') return restartLoad(rec);
  const increase = rec.action === 'increase_load' || rec.action === 'increase_reps';
  if (!increase) return rec;
  const lastDone = rec.evidence.used.at(-1)?.date;
  const longBreak = !!ctx.date && !!lastDone && daysBetween(lastDone, ctx.date) >= STRUCTURE.breakDays;
  const blockedBy = ctx.safetyActive
    ? 'safety'
    : ctx.fatigueHigh
      ? 'fatigue'
      : ctx.structure === 'light_week'
        ? 'deload'
        : ctx.structure === 'reduce_volume'
          ? 'volume'
          : longBreak
            ? 'break'
            : ctx.noPush && rec.action === 'increase_load'
              ? 'protected'
              : null;
  if (!blockedBy) return rec;
  const last = rec.evidence.last;
  const target =
    rec.action === 'increase_load'
      ? rec.proposedPrescription.repsMax
      : (last?.value ?? rec.proposedPrescription.repsMin);
  return {
    ...rec,
    action: 'maintain',
    reason: { key: `progression.reason.held_${blockedBy}`, params: {} },
    proposedPrescription: {
      ...rec.proposedPrescription,
      loadKg: last && last.loadKg > 0 ? last.loadKg : null,
      target: Math.max(rec.proposedPrescription.repsMin, Math.min(rec.proposedPrescription.repsMax, target)),
    },
    blockedBy,
  };
}

/**
 * Restart after a break, accepted (W-5, D-037 §14): one step under the last real load when the
 * catalogue knows the step, the bottom of the range, never an increase. Without a real load the
 * load stays as it was (bodyweight) and nothing goes up.
 */
function restartLoad(rec: ProgressionRecommendation): ProgressionRecommendation {
  const last = rec.evidence.last;
  const increment = getExercise(rec.exerciseId)?.loadIncrementKg ?? 0;
  const lower = last && last.loadKg > 0 && increment > 0 ? Math.max(0, last.loadKg - increment) : null;
  return {
    ...rec,
    action: lower !== null ? 'reduce_load' : 'maintain',
    reason: { key: 'progression.reason.restart', params: {} },
    proposedPrescription: {
      ...rec.proposedPrescription,
      loadKg: lower ?? (last && last.loadKg > 0 ? last.loadKg : null),
      target: rec.proposedPrescription.repsMin,
    },
    blockedBy: 'restart',
  };
}

/**
 * The structural proposal the Daily Coach shows today (D-037 §37): one at most, the first by the
 * engine's order (safety, restart, light week, volume, variants, exercise, cycle, frequency).
 */
export function primaryProposal(
  recommendations: readonly Recommendation[],
  adjustments: readonly Adjustment[] = [],
): Recommendation | null {
  return (
    undecided(recommendations, adjustments).find(
      (r) => r.mode === 'proposed' && r.kind !== 'none' && isStructural(r.change.key),
    ) ?? null
  );
}

/** Recommendations the user has not answered yet (any answer, on any device, hides it). */
export function undecided(
  recommendations: readonly Recommendation[],
  adjustments: readonly Adjustment[],
): Recommendation[] {
  const answered = new Set(adjustments.filter((a) => a.status !== 'proposed').map(decidedRecommendation));
  return recommendations.filter((r) => !answered.has(r.id));
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Weekly change of the 7-day average, in % of the earlier average; null without 2 weigh-ins on each side. */
export function weeklyChangePct(weights: AdaptationInput['weights'], end: IsoDate): number | null {
  const now = weightAverageAt(weights, end);
  const before = weightAverageAt(weights, addDays(end, -7));
  if (now === null || before === null) return null;
  return Math.round(((now - before) / before) * 100 * 100) / 100;
}

function weighInsIn(weights: AdaptationInput['weights'], end: IsoDate, days: number) {
  return weights.filter((w) => w.date > addDays(end, -days) && w.date <= end).length;
}

/** Average RPE per week for the last two full weeks, oldest first. */
function weeklyRpe(input: AdaptationInput): [number | null, number | null] {
  const thisWeek = startOfWeek(input.today);
  const of = (weekStart: IsoDate) => {
    const rpes = Object.entries(input.setLogs)
      .filter(([k]) => {
        const d = k.split('#')[0];
        return d >= weekStart && d <= addDays(weekStart, 6);
      })
      .flatMap(([, ex]) => Object.values(ex).flatMap((sets) => sets.map((s) => s.rpe)))
      .filter((r): r is number => r !== undefined);
    return rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  };
  return [of(addDays(thisWeek, -14)), of(addDays(thisWeek, -7))];
}

export interface Plateau {
  active: boolean;
  /** Why it is not called a plateau (too early, low adherence, not enough data). */
  notBecause?: 'too_early' | 'low_adherence' | 'not_enough_data' | 'moving';
  evidence: Record<string, string | number>;
}

const WEIGHT_GOALS: GoalType[] = ['fat_loss', 'weight_loss', 'muscle_gain'];

/**
 * Stagnation, never before 28 days, on a 21-day window. Adherence is checked first: under 70 %,
 * it is a plan to simplify, not a plateau.
 */
export function plateau(input: AdaptationInput): Plateau {
  const { today } = input;
  if (daysBetween(input.startedOn, today) < ADAPTATION.plateauMinDays)
    return { active: false, notBecause: 'too_early', evidence: {} };
  const adherence = input.adherence28.sessions.ratio;
  if (adherence !== null && adherence < ADAPTATION.minAdherence) {
    return { active: false, notBecause: 'low_adherence', evidence: { adherencePct: Math.round(adherence * 100) } };
  }
  if (WEIGHT_GOALS.includes(input.goal)) {
    const enough =
      weighInsIn(input.weights, today, 14) >= ADAPTATION.minWeighInsPer14Days &&
      weighInsIn(input.weights, addDays(today, -7), 14) >= ADAPTATION.minWeighInsPer14Days;
    const changes = [0, 7, 14].map((d) => weeklyChangePct(input.weights, addDays(today, -d)));
    if (!enough || changes.some((c) => c === null))
      return { active: false, notBecause: 'not_enough_data', evidence: {} };
    const flat = (changes as number[]).every((c) => Math.abs(c) < ADAPTATION.lossTooSlowPct);
    return flat
      ? { active: true, evidence: { weeks: 3, weeklyChangePct: (changes as number[])[0] } }
      : { active: false, notBecause: 'moving', evidence: {} };
  }
  if (input.goal === 'recomposition') {
    const from = addDays(today, -ADAPTATION.plateauMinDays);
    const waist = [...input.waist].sort((a, b) => a.date.localeCompare(b.date));
    const before = waist.filter((w) => w.date <= from).at(-1);
    const now = waist.at(-1);
    if (!before || !now || now.date <= from || input.trends.length === 0) {
      return { active: false, notBecause: 'not_enough_data', evidence: {} };
    }
    const waistStable = Math.abs(now.cm - before.cm) < ADAPTATION.recompStableWaistCm;
    const loadsStable = input.trends.every((t) => t.trend !== 'up');
    return waistStable && loadsStable
      ? { active: true, evidence: { waistChangeCm: round1(now.cm - before.cm), weeks: 4 } }
      : { active: false, notBecause: 'moving', evidence: {} };
  }
  return { active: false, notBecause: 'moving', evidence: {} };
}

function lastCalorieDecision(adjustments: Adjustment[]): Adjustment | undefined {
  return [...effectiveDecisions(adjustments).values()]
    .filter((a) => a.changeKey === 'calories_per_day' && a.status !== 'reverted')
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
}

/** A bounded calorie change: never more than ±150, never under the floor, never over maintenance + 20 %. */
function calorieChange(input: AdaptationInput, step: number): { from: number; to: number } | null {
  const bounded = Math.max(-ADAPTATION.maxKcalStep, Math.min(ADAPTATION.maxKcalStep, step));
  const target = input.targets.calories + bounded;
  const ceiling = input.targets.maintenance * (1 + ADAPTATION.gainCapOverMaintenance);
  const floor = minimumKcal(input.targets, input.noDeficit ?? false);
  const allowed = Math.round(Math.min(ceiling, Math.max(floor, target)) - input.targets.calories);
  if (allowed === 0 || Math.sign(allowed) !== Math.sign(bounded)) return null;
  return { from: input.calorieOffset, to: input.calorieOffset + allowed };
}

export function adapt(input: AdaptationInput): Recommendation[] {
  const { today, goal } = input;
  const week = startOfWeek(today);
  const out: Recommendation[] = [];
  const rec = (r: Omit<Recommendation, 'id'>): Recommendation => ({
    ...r,
    id: proposalKey(r.kind, r.change.key, r.target ?? null, week),
  });
  const nutrition = (step: number, reasonKey: string, evidence: Recommendation['evidence']) => {
    const change = calorieChange(input, step);
    if (!change) return;
    out.push(
      rec({
        kind: 'nutrition',
        change: { key: 'calories_per_day', ...change },
        reason: { key: reasonKey, params: { kcal: change.to - change.from } },
        evidence,
        mode: 'proposed',
      }),
    );
  };

  const last = lastCalorieDecision(input.adjustments);
  const coolingDown = !!last && daysBetween(last.decidedAt.slice(0, 10), today) < ADAPTATION.cooldownDays;
  const fatigueDays = input.dayLogs.filter(
    (d) => d.date > addDays(today, -7) && d.date <= today && (d.fatigue ?? 0) >= ADAPTATION.highFatigue,
  ).length;

  // 1. Safety first: nothing that adds deficit or volume, no other training change (W-5: the
  // safety message is never hidden behind an ordinary adaptation).
  if (input.safety.active) {
    if (input.safety.flags.includes('training_load')) {
      out.push(
        rec({
          kind: 'add_recovery',
          change: { key: 'rest_days', to: 1 },
          reason: { key: 'adaptation.reason.training_load', params: {} },
          evidence: { fatigueDays },
          // Advice: the user picks the day (skip or move a session, never a catch-up).
          mode: 'advice',
        }),
      );
      const light = lightWeek(
        input.adjustments,
        today,
        { key: 'adaptation.reason.light_week', params: { pct: 40 } },
        { fatigueDays },
      );
      if (light) out.push(rec(light));
    }
    const underFueled = input.safety.flags.find((f) => f === 'fast_weight_loss' || f === 'low_intake');
    if (underFueled && !coolingDown) {
      nutrition(ADAPTATION.kcalStep, `adaptation.reason.${underFueled}`, { flag: underFueled });
    }
    if (out.length === 0) out.push(none('adaptation.none.safety', 'safety'));
    return out;
  }

  // 6 bis. Restart after a break (W-5): before the other training rules, whose signals are old.
  const restart = input.structural ? restartDraft(input.adjustments, input.structural, today) : null;
  if (restart) out.push(rec(restart));

  // 7. Load: heavy effort two weeks running or fatigue declared 3 days out of 7. Repeated fatigue
  // lightens the training only when there was training to lighten (W-5 §13: two full sessions in
  // 14 days, not mostly short or light ones); otherwise it is advice to rest.
  const [rpeBefore, rpeLast] = weeklyRpe(input);
  const heavy =
    rpeBefore !== null && rpeLast !== null && rpeBefore >= ADAPTATION.heavyRpe && rpeLast >= ADAPTATION.heavyRpe;
  const tired = fatigueDays >= ADAPTATION.highFatigueDays;
  const recent = input.structural?.recent14;
  const trained = !recent || (recent.full >= STRUCTURE.fatigueFullSessions && recent.full >= recent.other);
  if (!restart && (heavy || (tired && trained))) {
    const light = lightWeek(
      input.adjustments,
      today,
      { key: 'adaptation.reason.light_week', params: { pct: 40 } },
      {
        fatigueDays,
        ...(rpeLast !== null ? { rpe: round1(rpeLast) } : {}),
        ...(recent ? { fullSessions: recent.full } : {}),
      },
    );
    if (light) out.push(rec(light));
  } else if (!restart && tired) {
    out.push(
      rec({
        kind: 'add_recovery',
        change: { key: 'rest_days', to: 1 },
        reason: { key: 'adaptation.reason.fatigue_rest', params: { days: fatigueDays } },
        evidence: { fatigueDays, ...(recent ? { fullSessions: recent.full } : {}) },
        mode: 'advice',
      }),
    );
  }

  // 7 bis. Performance going down on several exercises (a trend, never one session): a lighter
  // week is proposed, never imposed; nothing is said about the user, only about the sessions.
  const down = input.progression?.down ?? [];
  if (!restart && down.length >= PERFORMANCE_DOWN_EXERCISES && !out.some((r) => r.change.key === 'light_week')) {
    const light = lightWeek(
      input.adjustments,
      today,
      { key: 'adaptation.reason.performance_down', params: { count: down.length } },
      { exercises: down.length },
    );
    if (light) out.push(rec(light));
  }

  // 7 ter. Structural training changes (W-5, D-037): plateau, volume, variants, exercises, cycle.
  if (!restart && input.structural) {
    for (const draft of structuralDrafts({
      today,
      adjustments: input.adjustments,
      signals: input.structural,
      lightWeekProposed: out.some((r) => r.change.key === 'light_week'),
    }))
      out.push(rec(draft));
  }

  // 8. Planning: sessions moved twice or more to the same weekday in two weeks.
  const moves = Object.entries(input.rescheduled).filter(([from]) => from > addDays(today, -14) && from <= today);
  const byDay = new Map<number, number>();
  for (const [, to] of moves) byDay.set(weekdayOf(to), (byDay.get(weekdayOf(to)) ?? 0) + 1);
  const [usedDay, count] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  if (count >= ADAPTATION.sameDayMoves) {
    out.push(
      rec({
        kind: 'planning',
        change: { key: 'session_day', to: usedDay },
        reason: { key: 'adaptation.reason.moved_sessions', params: { count, weekday: usedDay } },
        evidence: { moves: count },
        // Advice: the availabilities are the user's to change (profile), never moved silently.
        mode: 'advice',
      }),
    );
  }

  // 9. Budget over two weeks running: advice only, no price invented.
  if (input.spending && input.spending.every((w) => w.budgetCents > 0 && w.spentCents > w.budgetCents)) {
    out.push(
      rec({
        kind: 'nutrition',
        change: { key: 'use_inventory' },
        reason: { key: 'adaptation.reason.budget', params: {} },
        evidence: { weeks: 2 },
        mode: 'advice',
      }),
    );
  }

  // 10. Four weeks at 100 % after a reduction: offer to go back.
  const cut = input.adjustments
    .filter((a) => a.changeKey === 'sessions_per_week' && a.status === 'applied')
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
  if (
    cut &&
    input.sessionsPerWeek.current < input.sessionsPerWeek.profile &&
    daysBetween(cut.effectiveFrom, today) >= ADAPTATION.backToPlanWeeks * 7 &&
    input.adherence28.sessions.ratio === 1
  ) {
    out.push(
      rec({
        kind: 'training',
        change: { key: 'sessions_per_week', from: input.sessionsPerWeek.current, to: input.sessionsPerWeek.profile },
        reason: { key: 'adaptation.reason.back_to_plan', params: { count: input.sessionsPerWeek.profile } },
        evidence: { weeks: ADAPTATION.backToPlanWeeks },
        mode: 'proposed',
      }),
    );
  }

  // 2. Calibration: we are still getting to know you.
  if (daysBetween(input.startedOn, today) < ADAPTATION.calibrationDays) {
    return finish(out, 'adaptation.none.calibration', 'calibration');
  }

  // 3. Low adherence: simplify the plan, never the calories.
  const sessions = input.adherence14.sessions.ratio;
  const meals = input.adherence14.mealLogging?.ratio ?? null;
  if (
    (sessions !== null && sessions < ADAPTATION.minAdherence) ||
    (meals !== null && meals < ADAPTATION.minAdherence)
  ) {
    if (sessions !== null && sessions < ADAPTATION.minAdherence) {
      if (input.missedPerWeek.every((m) => m >= 2) && input.sessionsPerWeek.current > 1) {
        out.push(
          rec({
            kind: 'training',
            change: {
              key: 'sessions_per_week',
              from: input.sessionsPerWeek.current,
              to: input.sessionsPerWeek.current - 1,
            },
            reason: { key: 'adaptation.reason.fewer_sessions', params: { count: input.sessionsPerWeek.current - 1 } },
            evidence: { adherencePct: Math.round(sessions * 100), missedLastWeeks: 2 },
            mode: 'proposed',
          }),
        );
      } else {
        out.push(
          rec({
            kind: 'planning',
            change: { key: 'shorter_sessions' },
            reason: { key: 'adaptation.reason.shorter_sessions', params: {} },
            evidence: { adherencePct: Math.round(sessions * 100) },
            mode: 'advice',
          }),
        );
      }
    }
    if (meals !== null && meals < ADAPTATION.minAdherence) {
      out.push(
        rec({
          kind: 'simplify_tracking',
          change: { key: 'tracking_routine' },
          reason: { key: 'adaptation.reason.simplify_tracking', params: {} },
          evidence: { mealLoggingPct: Math.round(meals * 100) },
          mode: 'advice',
        }),
      );
    }
    return finish(out, 'adaptation.none.low_adherence', 'low_adherence');
  }

  // 4. Enough weigh-ins to talk about calories.
  const enough = weighInsIn(input.weights, today, 14) >= ADAPTATION.minWeighInsPer14Days;
  // 5. Cooldown: one calorie change at most every 14 days, a declined one not re-proposed before.
  const calorieBlock: BlockReason | null = coolingDown ? 'cooldown' : !enough ? 'not_enough_data' : null;

  // 6. Trend by goal.
  const changes = [14, 7, 0].map((d) => weeklyChangePct(input.weights, addDays(today, -d)));
  const known = changes.every((c) => c !== null) ? (changes as number[]) : null;
  const lastTwo = changes.slice(1).every((c) => c !== null) ? (changes.slice(1) as number[]) : null;
  const adherencePct = sessions === null ? null : Math.round(sessions * 100);
  const evidence = (extra: Recommendation['evidence'] = {}) => ({
    ...(known ? { weeklyChangePct: known[2] } : {}),
    ...(adherencePct !== null ? { adherencePct } : {}),
    weighIns: weighInsIn(input.weights, today, 14),
    ...extra,
  });
  if (!calorieBlock) {
    if (goal === 'fat_loss' || goal === 'weight_loss') {
      if (lastTwo && lastTwo.every((c) => c < -ADAPTATION.lossTooFastPct)) {
        nutrition(ADAPTATION.kcalStep, 'adaptation.reason.too_fast_loss', evidence());
      } else if (known && known.every((c) => c > -ADAPTATION.lossTooSlowPct)) {
        nutrition(-ADAPTATION.kcalStep, 'adaptation.reason.too_slow_loss', evidence({ weeks: 3 }));
      }
    } else if (goal === 'muscle_gain') {
      if (lastTwo && lastTwo.every((c) => c > ADAPTATION.gainTooFastPct)) {
        nutrition(-ADAPTATION.smallKcalStep, 'adaptation.reason.too_fast_gain', evidence());
      } else if (known && known.every((c) => c < ADAPTATION.gainTooSlowPct)) {
        nutrition(ADAPTATION.kcalStep, 'adaptation.reason.too_slow_gain', evidence({ weeks: 3 }));
      }
    } else if (goal === 'recomposition') {
      if (lastTwo && lastTwo.every((c) => c < -ADAPTATION.recompLossTooFastPct)) {
        nutrition(ADAPTATION.smallKcalStep, 'adaptation.reason.recomp_losing', evidence());
      }
    } else {
      const now = weightAverageAt(input.weights, today);
      const before = weightAverageAt(input.weights, addDays(today, -28));
      if (now !== null && before !== null && Math.abs(now - before) > ADAPTATION.maintenanceDriftKg) {
        const drift = round1(now - before);
        nutrition(drift > 0 ? -ADAPTATION.smallKcalStep : ADAPTATION.smallKcalStep, 'adaptation.reason.drift', {
          ...evidence(),
          driftKg: drift,
        });
      }
    }
  }
  const p = plateau(input);
  if (goal === 'recomposition' && p.active) {
    out.push(
      rec({
        kind: 'training',
        change: { key: 'progression_review' },
        reason: { key: 'adaptation.reason.recomp_plateau', params: {} },
        evidence: p.evidence,
        mode: 'advice',
      }),
    );
  }
  // Stagnation of an exercise over three weeks or more, with regular sessions: a program question
  // (variation, rest, technique), never a reproach and never a calorie change. Advice only; a
  // plateau that lasts says that the end of the cycle can bring a small evolution (W-5).
  const stagnating = input.progression?.stagnating ?? [];
  const persistent = input.progression?.persistent ?? [];
  if (stagnating.length > 0 && !out.some((r) => r.change.key === 'progression_review')) {
    out.push(
      rec({
        kind: 'training',
        change: { key: 'progression_review' },
        reason: {
          key: persistent.length > 0 ? 'adaptation.reason.stagnation_persistent' : 'adaptation.reason.stagnation',
          params: { count: stagnating.length },
        },
        evidence: { exercises: stagnating.length },
        mode: 'advice',
      }),
    );
  }
  if (calorieBlock && WEIGHT_GOALS.includes(goal)) {
    return finish(out, `adaptation.none.${calorieBlock}`, calorieBlock);
  }
  return finish(out, 'adaptation.none.working', undefined);
}

function none(key: string, blockedBy?: BlockReason): Recommendation {
  return {
    id: `none:${key}`,
    kind: 'none',
    change: { key: 'none' },
    reason: { key, params: {} },
    evidence: {},
    mode: 'advice',
    ...(blockedBy ? { blockedBy } : {}),
  };
}

/**
 * Always at least one output: `none` with its reason when nothing changes. A block on calories is
 * always said, even next to other recommendations ("not enough weigh-ins: your calories stay").
 */
function finish(out: Recommendation[], key: string, blockedBy: BlockReason | undefined): Recommendation[] {
  if (blockedBy) return [...out, none(key, blockedBy)];
  return out.length > 0 ? out : [none(key)];
}
