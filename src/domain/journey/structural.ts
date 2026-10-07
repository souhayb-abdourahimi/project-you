/**
 * Structural adaptations of the Workout Coach (W-5, D-037): the rules of the Adaptation Engine
 * that propose a change bigger than a micro-progression. Same engine, same `Recommendation`, same
 * journal (`adjustments`): nothing here applies anything (D-036, "changement structurel →
 * proposition explicite → acceptation → application → historique").
 *
 * - Never on one session: every signal is a repetition (sessions, days, occurrences).
 * - Under the safety rule nothing here speaks (the safety branch of `adapt()` returns first).
 * - A refusal is respected, "pas maintenant" waits, a change in force is not proposed again, and a
 *   change that just ended waits before it comes back (`allowedAgain`).
 * - Temporary reasons (busy machine, missing equipment, no time) never change the program.
 * - Every proposal says what changes, why (real facts), for how long, and what it does.
 */
import { addDays, daysBetween, type IsoDate } from '../shared/dates';
import {
  appliedDecisions,
  byDecision,
  byInstant,
  decidedRecommendation,
  effectiveDecisions,
  type Adjustment,
  type AdjustmentScope,
  type AdaptationKind,
} from './adjustments';
import { EFFECT_COVERAGE, minCheckinDays } from './effect-coverage';
import { covers, idList, lastDay, STRUCTURE, type CycleOption, type ExercisePattern } from '../training/structure';
import type { ProgressionSignals } from '../training/week';

export interface ProposalScope {
  kind: AdjustmentScope;
  /** Days covered from the day it is accepted (week, weeks; the maximum for sessions). */
  days?: number;
  sessions?: number;
}

/** What the structural rules read (assembled by `useJourney`, all from stored facts). */
export interface StructuralSignals {
  progression: ProgressionSignals;
  patterns: ExercisePattern[];
  incomplete: { incomplete: number; of: number };
  /** Last session done before today; null when none. */
  lastBreak: { lastDate: IsoDate; days: number; sessionsBefore: number } | null;
  /** A planned session today or later this week (a restart is proposed for a session to come). */
  plannedAhead: boolean;
  /** Full and other (short, light) sessions done in the last 14 days. */
  recent14: { full: number; other: number };
  cycle: { start: IsoDate; week: number; weeks: number; ended: boolean } | null;
  /** Exercises of the active version, and those it excludes. */
  inProgram: string[];
  /** Catalogue easier variant available for an exercise (version equipment, exclusions), or null. */
  easierFor: (exerciseId: string) => string | null;
  /** The exercise the engine would put in its place if it were excluded (preview), or null. */
  replacementFor: (exerciseId: string) => string | null;
  /** End-of-cycle evolution preview: rotated exercises and what replaces them. */
  evolution: { rotated: string[]; changes: { from: string; to: string }[] } | null;
  /** Facts shown in the end-of-cycle review. */
  cycleFacts: Record<string, number>;
  /** Sessions done under each decision (a `sessions` scope ends when they are done). */
  doneUnder?: Record<string, number>;
}

/** What a proposal targets (an exercise, a list), to match it with earlier decisions. */
export function targetsOf(a: Pick<Adjustment, 'changeKey' | 'from'>): string[] {
  return a.changeKey === 'easier_variant' || a.changeKey === 'exercise_change' ? idList(a.from) : [];
}

/**
 * Whether a change may be proposed again (D-037 §19–20), from the latest decision on it:
 * - in force (applied, still covering today, or durable) → no;
 * - "Pas maintenant" → after `postponeDays`; "Refuser" or "Revenir en arrière" → after
 *   `declineCooldownDays`; ended → after `reapplyGapDays` (time to see its effect).
 */
export function allowedAgain(
  adjustments: readonly Adjustment[],
  changeKey: string,
  today: IsoDate,
  target?: string,
): boolean {
  const latest = [...effectiveDecisions(adjustments).values()]
    .filter((a) => a.changeKey === changeKey && (target === undefined || targetsOf(a).includes(target)))
    .sort(byInstant)
    .at(-1);
  if (!latest) return true;
  const since = daysBetween(latest.effectiveFrom, today);
  // An end-of-cycle review comes back with the next cycle (`cycleState` restarts at each answer).
  if (changeKey === 'cycle_review') return latest.status !== 'postponed' || since >= STRUCTURE.postponeDays;
  switch (latest.status) {
    case 'postponed':
      return since >= STRUCTURE.postponeDays;
    case 'declined':
    case 'reverted':
      return since >= STRUCTURE.declineCooldownDays;
    case 'applied': {
      const end = lastDay(latest);
      if (end === null) return false;
      return today > end && daysBetween(end, today) >= STRUCTURE.reapplyGapDays;
    }
    default:
      return true;
  }
}

export type Draft = {
  kind: Exclude<AdaptationKind, 'none'>;
  change: { key: string; from?: number | string; to?: number | string };
  reason: { key: string; params: Record<string, string | number> };
  evidence: Record<string, string | number>;
  mode: 'proposed' | 'advice';
  target?: string | null;
  scope?: ProposalScope | null;
  options?: CycleOption[];
};

const LIGHT_WEEK: ProposalScope = { kind: 'week', days: STRUCTURE.lightWeekDays };

/** A light week, when none is in force or refused recently (one per week at most). */
export function lightWeek(
  adjustments: readonly Adjustment[],
  today: IsoDate,
  reason: Draft['reason'],
  evidence: Draft['evidence'],
): Draft | null {
  if (!allowedAgain(adjustments, 'light_week', today)) return null;
  // An end-of-cycle light week in force is a light week too.
  if (
    adjustments.some(
      (a) => a.status === 'applied' && a.changeKey === 'cycle_review' && a.to === 'light_week' && covers(a, today),
    )
  )
    return null;
  return {
    kind: 'reduce_load',
    change: { key: 'light_week', to: 'light' },
    reason,
    evidence,
    mode: 'proposed',
    scope: LIGHT_WEEK,
  };
}

/** New occurrences of a pattern since a date (after a refusal, the question needs new facts). */
const after = (p: ExercisePattern | undefined, date: IsoDate | null) =>
  p ? p.keys.filter((k) => date === null || k.split('#')[0] > date).length : 0;

/**
 * The structural rules, in the order of the Daily Coach's preference (D-037 §2): restart, light
 * week (fatigue, decline, hard plateau), reduced volume, easier variants (grouped), durable
 * exercise changes (one by one), end-of-cycle review. Called by `adapt()` after the safety branch.
 */
/**
 * Restart after a break (D-037 §14): no session for `breakDays` after at least two, and a session
 * to come. Proposed before every other training rule: the other signals are from before the break.
 */
export function restartDraft(adjustments: readonly Adjustment[], s: StructuralSignals, today: IsoDate): Draft | null {
  const b = s.lastBreak;
  if (
    !b ||
    b.days < STRUCTURE.breakDays ||
    b.sessionsBefore < STRUCTURE.breakMinSessionsBefore ||
    !s.plannedAhead ||
    !allowedAgain(adjustments, 'restart', today)
  )
    return null;
  return {
    kind: 'reduce_load',
    change: { key: 'restart', to: STRUCTURE.restartSessions },
    reason: { key: 'adaptation.reason.restart', params: { days: b.days, sessions: STRUCTURE.restartSessions } },
    evidence: { daysSinceLastSession: b.days, sessionsBefore: b.sessionsBefore },
    mode: 'proposed',
    scope: { kind: 'sessions', sessions: STRUCTURE.restartSessions, days: STRUCTURE.restartMaxDays },
  };
}

export function structuralDrafts(input: {
  today: IsoDate;
  adjustments: readonly Adjustment[];
  signals: StructuralSignals;
  /** A light week is already proposed by another rule this week. */
  lightWeekProposed: boolean;
}): Draft[] {
  const { today, adjustments, signals: s } = input;
  const out: Draft[] = [];

  // 1. A plateau that lasts and felt very hard: a lighter week may help more than waiting.
  const hardPlateau = s.progression.persistent.filter((id) => s.progression.hard.includes(id));
  if (!input.lightWeekProposed && hardPlateau.length > 0) {
    const draft = lightWeek(
      adjustments,
      today,
      { key: 'adaptation.reason.stagnation_hard', params: { count: hardPlateau.length } },
      { exercises: hardPlateau.length, weeks: Math.floor(STRUCTURE.persistentStagnationDays / 7) },
    );
    if (draft) out.push(draft);
  }
  const lightWeekSoon = input.lightWeekProposed || out.length > 0;

  // 2. Sets missing on several exercises, session after session (not for time, not tired).
  if (
    !lightWeekSoon &&
    s.incomplete.of >= STRUCTURE.incompleteWindow &&
    s.incomplete.incomplete >= STRUCTURE.incompleteSessions &&
    allowedAgain(adjustments, 'reduce_volume', today) &&
    allowedAgain(adjustments, 'restart', today)
  ) {
    out.push({
      kind: 'reduce_load',
      change: { key: 'reduce_volume', to: -STRUCTURE.volumeStep },
      reason: {
        key: 'adaptation.reason.reduce_volume',
        params: { count: s.incomplete.incomplete, of: s.incomplete.of, weeks: STRUCTURE.reduceVolumeDays / 7 },
      },
      evidence: { incompleteSessions: s.incomplete.incomplete, sessions: s.incomplete.of, minSets: STRUCTURE.minSets },
      mode: 'proposed',
      scope: { kind: 'weeks', days: STRUCTURE.reduceVolumeDays },
    });
  }

  // 3–4. One exercise, again and again: easier variant (grouped) or a question for the program.
  const pattern = (id: string, category: ExercisePattern['category']) =>
    s.patterns.find((p) => p.exerciseId === id && p.category === category);
  const decided = (key: string, id: string) =>
    [...effectiveDecisions(adjustments).values()]
      .filter((a) => a.changeKey === key && targetsOf(a).includes(id))
      .sort(byInstant)
      .at(-1) ?? null;
  const easier: { from: string; to: string; evidence: string }[] = [];
  for (const id of [...s.inProgram].sort()) {
    const lastChange = decided('exercise_change', id);
    const lastEasier = decided('easier_variant', id);
    // After "le garder", the question comes back only with new occurrences and after the cooldown.
    const since = lastChange && lastChange.status !== 'postponed' ? lastChange.effectiveFrom : null;
    const durable = (category: ExercisePattern['category'], reasonKey: string) => {
      const n = after(pattern(id, category), since);
      if (n < STRUCTURE.repeat || !allowedAgain(adjustments, 'exercise_change', today, id)) return false;
      const to = s.replacementFor(id);
      out.push({
        kind: 'training',
        change: { key: 'exercise_change', from: id, ...(to ? { to } : {}) },
        reason: { key: reasonKey, params: { count: n } },
        evidence: { occurrences: n },
        mode: 'proposed',
        target: id,
        scope: { kind: 'durable' },
      });
      return true;
    };
    // A movement that bothered several times: a question, never a diagnosis.
    if (durable('safety', 'adaptation.reason.exercise_discomfort')) continue;
    if (durable('preference', 'adaptation.reason.exercise_preference')) continue;
    const tooHard = pattern(id, 'too_hard');
    const struggling = s.progression.struggling.find((x) => x.exerciseId === id);
    const variant = s.easierFor(id);
    const easierEnded = lastEasier?.status === 'applied' && !covers(lastEasier, today, s.doneUnder);
    // Still too hard after an easier variant (or none exists): a durable question. While the
    // variant runs the exercise is not prescribed, so the reports that count are those after it.
    if ((easierEnded || !variant) && tooHard) {
      const since2 = easierEnded ? lastEasier!.effectiveFrom : null;
      if (after(tooHard, since2) >= STRUCTURE.repeat && durable('too_hard', 'adaptation.reason.exercise_too_hard'))
        continue;
    }
    if (!variant || lightWeekSoon || !allowedAgain(adjustments, 'easier_variant', today, id)) continue;
    if ((tooHard?.keys.length ?? 0) >= STRUCTURE.repeat) {
      easier.push({ from: id, to: variant, evidence: 'declared' });
    } else if (struggling) {
      easier.push({ from: id, to: variant, evidence: 'misses' });
    }
  }
  if (easier.length > 0) {
    const group = easier.slice(0, STRUCTURE.maxGrouped);
    const single = group.length === 1 ? group[0] : null;
    const struggling = single ? s.progression.struggling.find((x) => x.exerciseId === single.from) : undefined;
    out.push({
      kind: 'training',
      change: { key: 'easier_variant', from: group.map((g) => g.from).join(','), to: group.map((g) => g.to).join(',') },
      reason: {
        key: single
          ? single.evidence === 'misses'
            ? 'adaptation.reason.easier_misses'
            : 'adaptation.reason.easier_declared'
          : 'adaptation.reason.easier_group',
        params: {
          count: group.length,
          sessions: STRUCTURE.easierSessions,
          ...(struggling ? { misses: struggling.misses, of: struggling.sessions } : {}),
        },
      },
      evidence: struggling ? { misses: struggling.misses, sessions: struggling.sessions } : { exercises: group.length },
      mode: 'proposed',
      target: group.map((g) => g.from).join(','),
      scope: { kind: 'sessions', sessions: STRUCTURE.easierSessions, days: STRUCTURE.easierMaxDays },
    });
  }

  // 5. End of the 6-week cycle: a review, the user decides (never a forced light week).
  if (s.cycle?.ended && allowedAgain(adjustments, 'cycle_review', today)) {
    const evolve = (s.evolution?.changes.length ?? 0) > 0;
    out.push({
      kind: 'training',
      change: { key: 'cycle_review', ...(evolve ? { from: s.evolution!.rotated.join(',') } : {}), to: 'continue' },
      reason: { key: 'adaptation.reason.cycle_review', params: { weeks: s.cycle.weeks } },
      evidence: s.cycleFacts,
      mode: 'proposed',
      options: ['continue', 'light_week', ...(evolve ? (['evolve'] as const) : [])],
      scope: null,
    });
  }
  return out;
}

/** Scope of an end-of-cycle answer: a light week lasts a week, an evolution is a new version. */
export function cycleOptionScope(option: CycleOption): ProposalScope | null {
  if (option === 'light_week') return LIGHT_WEEK;
  if (option === 'evolve') return { kind: 'durable' };
  return null;
}

/**
 * Before / after an applied structural change (D-037 §22–23, W-7.1 D-041): only facts, never a
 * cause. Two windows of the same number of complete days: the days just before the change, and the
 * days it covered (up to yesterday while it runs, up to the day before a revert). Each side says
 * how much data it has; below `EFFECT_COVERAGE` the reading is `insufficient_data`, never "better".
 * An effect stays in the history after the change is reverted: what was observed was observed.
 */
export interface AdaptationEffect {
  decisionId: string;
  changeKey: string;
  /** The declared signal or measured cause (reason and evidence of the decision). */
  cause: { reasonKey: string; evidence: Record<string, string | number> };
  /** `endedBy`: the scope ran out, or a later answer (a revert, another device) ended it. */
  period: { from: IsoDate; to: IsoDate; days: number; running: boolean; endedBy: 'scope' | 'answer' | null };
  before: EffectMetrics;
  after: EffectMetrics;
  /** Completed sessions over planned ones, compared only with enough planned sessions each side. */
  completion: EffectReading;
  /** Share of check-in days with high fatigue, compared only with enough check-ins each side. */
  fatigue: EffectReading;
  /** Observed changes, never presented as caused by the adaptation. */
  observations: EffectObservation[];
}

export type EffectReading = 'higher' | 'lower' | 'same' | 'insufficient_data';
export type EffectObservation =
  | 'sessions_more_complete'
  | 'sessions_less_complete'
  | 'sessions_insufficient_data'
  | 'fatigue_lower'
  | 'fatigue_higher'
  | 'fatigue_insufficient_data';

export interface EffectMetrics {
  /** Complete days in the window. */
  days: number;
  planned: number;
  done: number;
  /** Days with a declared fatigue (the coverage of `fatigueDays`). */
  checkinDays: number;
  fatigueDays: number;
}

export function adaptationEffects(input: {
  /** The journal (structural rows): every applied row, in force or not anymore. */
  decisions: readonly Adjustment[];
  today: IsoDate;
  plannedDates: readonly IsoDate[];
  doneDates: readonly IsoDate[];
  /** Days with a check-in that declared a fatigue level, high or not. */
  checkinDates: readonly IsoDate[];
  fatigueDates: readonly IsoDate[];
}): AdaptationEffect[] {
  const metrics = (from: IsoDate, to: IsoDate): EffectMetrics => {
    const inside = (d: IsoDate) => d >= from && d <= to;
    const checkins = new Set(input.checkinDates.filter(inside));
    return {
      days: to < from ? 0 : daysBetween(from, to) + 1,
      planned: input.plannedDates.filter(inside).length,
      done: input.doneDates.filter(inside).length,
      checkinDays: checkins.size,
      // A high-fatigue day is a check-in day too.
      fatigueDays: new Set(input.fatigueDates.filter(inside)).size,
    };
  };
  const compare = (b: number, a: number): EffectReading => (a > b ? 'higher' : a < b ? 'lower' : 'same');
  const completion = (b: EffectMetrics, a: EffectMetrics): EffectReading =>
    b.planned < EFFECT_COVERAGE.minPlannedSessions || a.planned < EFFECT_COVERAGE.minPlannedSessions
      ? 'insufficient_data'
      : compare(Math.min(1, b.done / b.planned), Math.min(1, a.done / a.planned));
  const fatigue = (b: EffectMetrics, a: EffectMetrics): EffectReading => {
    const covered = (m: EffectMetrics) =>
      m.days > 0 && Math.max(m.checkinDays, m.fatigueDays) >= minCheckinDays(m.days);
    if (!covered(b) || !covered(a)) return 'insufficient_data';
    const rate = (m: EffectMetrics) => m.fatigueDays / Math.max(m.checkinDays, m.fatigueDays);
    return compare(rate(b), rate(a));
  };

  const ordered = [...input.decisions].filter((d) => d.status !== 'proposed').sort(byDecision);
  return ordered
    .filter((d) => d.status === 'applied' && d.effectiveFrom <= input.today)
    .map((d) => {
      // A later answer on the same proposal ends the window the day before it took effect.
      const next = ordered.find(
        (x) => x !== d && decidedRecommendation(x) === decidedRecommendation(d) && byDecision(d, x) < 0,
      );
      const scopeEnd = lastDay(d);
      const answerEnd = next ? addDays(next.effectiveFrom, -1) : null;
      const yesterday = addDays(input.today, -1);
      const ends = [scopeEnd, answerEnd].filter((x): x is IsoDate => x !== null && x < input.today);
      const running = ends.length === 0;
      const to = running ? yesterday : ends.sort()[0];
      const endedBy = running ? null : answerEnd !== null && to === answerEnd ? 'answer' : 'scope';
      const after = metrics(d.effectiveFrom, to);
      const before = metrics(addDays(d.effectiveFrom, -after.days), addDays(d.effectiveFrom, -1));
      const c = completion(before, after);
      const f = fatigue(before, after);
      // Fatigue is part of the story when the cause was fatigue or some was declared around it.
      const fatigueMatters = 'fatigueDays' in d.evidence || before.fatigueDays + after.fatigueDays > 0;
      const observations: EffectObservation[] = [];
      if (c === 'higher') observations.push('sessions_more_complete');
      if (c === 'lower') observations.push('sessions_less_complete');
      if (c === 'insufficient_data') observations.push('sessions_insufficient_data');
      if (f === 'lower') observations.push('fatigue_lower');
      if (f === 'higher') observations.push('fatigue_higher');
      if (f === 'insufficient_data' && fatigueMatters) observations.push('fatigue_insufficient_data');
      return {
        decisionId: d.id,
        changeKey: d.changeKey,
        cause: { reasonKey: d.reasonKey, evidence: d.evidence },
        period: { from: d.effectiveFrom, to, days: after.days, running, endedBy },
        before,
        after,
        completion: c,
        fatigue: f,
        observations,
      };
    });
}

/**
 * "Le garder" answers (D-037 §25): each declined `exercise_change` in force, with the number of
 * sessions where a preference was stated up to that answer. The question comes back only after as
 * many new ones (journey memory). Legacy answers stored on the device (W-3) still count.
 */
export function keptExercises(
  adjustments: readonly Adjustment[],
  swapReasons: Record<string, Record<string, string>>,
  legacy: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = { ...legacy };
  for (const d of effectiveDecisions(adjustments).values()) {
    if (d.changeKey !== 'exercise_change' || d.status !== 'declined') continue;
    for (const id of idList(d.from)) {
      const seen = Object.entries(swapReasons).filter(
        ([key, swaps]) =>
          key.split('#')[0] <= d.effectiveFrom && (swaps[id] === 'preference' || swaps[id] === 'dislike'),
      ).length;
      out[id] = Math.max(out[id] ?? 0, seen);
    }
  }
  return out;
}

/** A structural change in force today, for the screens (Progress Journey, Programme, D-037 §38). */
export interface ActiveAdaptation {
  decision: Adjustment;
  key: 'light_week' | 'restart' | 'reduce_volume' | 'easier_variant' | 'exercise_change' | 'cycle_evolve';
  /** Last day covered; null for a durable change. */
  until: IsoDate | null;
}

export function activeAdaptations(
  adjustments: readonly Adjustment[],
  today: IsoDate,
  done: Record<string, number> = {},
): ActiveAdaptation[] {
  const out: ActiveAdaptation[] = [];
  for (const d of appliedDecisions(adjustments)) {
    if (!covers(d, today, done)) continue;
    const key: ActiveAdaptation['key'] | null =
      d.changeKey === 'cycle_review'
        ? d.to === 'light_week'
          ? 'light_week'
          : d.to === 'evolve'
            ? 'cycle_evolve'
            : null
        : ((['light_week', 'restart', 'reduce_volume', 'easier_variant', 'exercise_change'] as const).find(
            (k) => k === d.changeKey,
          ) ?? null);
    if (key) out.push({ decision: d, key, until: lastDay(d) });
  }
  return out;
}
