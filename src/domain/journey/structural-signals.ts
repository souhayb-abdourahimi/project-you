/**
 * The facts the structural rules read (W-5, D-037), assembled from stored data only: the
 * exercises' own histories, the reasons the user gave, the sessions done and planned, the active
 * program version and the decisions already taken. Nothing is estimated, nothing is inferred
 * from one session. Pure: `useJourney` calls it with the store.
 */
import { addDays, type IsoDate } from '../shared/dates';
import type { SessionKey } from '../shared/ids';
import type { ProgramVersion } from '../training/program';
import type { ReplacementReason } from '../training/replacement';
import type { ExerciseReport } from '../training/session';
import { appliedDecisions, type Adjustment } from './adjustments';
import {
  cycleEvolution,
  cycleState,
  easierVariantFor,
  exercisePatterns,
  incompleteSessions,
  recentSessions,
  replacementPreview,
  sessionsDoneUnder,
  trainingBreak,
} from '../training/structure';
import { versionTemplates, type ProgressionSignals, type TrainingRecords } from '../training/week';
import type { ExerciseTrend } from './progress-facts';
import type { StructuralSignals } from './structural';

export function structuralSignals(input: {
  today: IsoDate;
  adjustments: readonly Adjustment[];
  progression: ProgressionSignals;
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>;
  program: ProgramVersion | null;
  facts: {
    setLogs: Record<SessionKey, Record<string, readonly unknown[]>>;
    completedSessions: readonly { date: IsoDate; sessionIndex: number; variant?: string; stopped?: string }[];
    exerciseSwaps?: Record<SessionKey, Record<string, string>>;
    swapReasons?: Record<SessionKey, Record<string, ReplacementReason>>;
    exerciseReports?: Record<SessionKey, Record<string, ExerciseReport>>;
  };
  /** Days with a high declared fatigue (same threshold as the Adaptation Engine). */
  fatigueDates: readonly IsoDate[];
  /** Planned session dates (after reschedules), past weeks and this one. */
  plannedSessionDates: readonly IsoDate[];
  trends: readonly ExerciseTrend[];
}): StructuralSignals {
  const { today, program, adjustments } = input;
  const params = program?.params ?? null;
  const ctx = { equipment: params?.equipment ?? [], excluded: params?.excludedExerciseIds ?? [] };
  const inProgram = program
    ? [...new Set(versionTemplates(program).flatMap((s) => s.exercises.map((e) => e.exerciseId)))].sort()
    : [];
  const cycle = cycleState(program, adjustments, today);
  const evolution = cycle?.ended && params ? cycleEvolution(params, [...input.progression.stagnating].sort()) : null;
  const inCycle = (d: IsoDate) => !!cycle && d >= cycle.start && d <= today;
  const completedDates = input.facts.completedSessions.map((c) => c.date);
  const cycleFacts: Record<string, number> = cycle
    ? {
        weeks: cycle.weeks,
        sessionsDone: completedDates.filter(inCycle).length,
        sessionsPlanned: input.plannedSessionDates.filter(inCycle).length,
        progressing: input.trends.filter((t) => t.trend === 'up').length,
        stagnating: input.progression.stagnating.length,
        fatigueDays: new Set(input.fatigueDates.filter(inCycle)).size,
        exercisesReplaced: appliedDecisions(adjustments).filter(
          (d) => d.changeKey === 'exercise_change' && inCycle(d.effectiveFrom),
        ).length,
      }
    : {};
  return {
    progression: input.progression,
    patterns: exercisePatterns(input.facts, today),
    incomplete: incompleteSessions({
      records: input.records,
      facts: input.facts,
      fatigueDates: new Set(input.fatigueDates),
      today,
    }),
    lastBreak: trainingBreak(input.facts.completedSessions, today),
    plannedAhead: input.plannedSessionDates.some((d) => d >= today && d <= addDays(today, 6)),
    recent14: recentSessions(input.facts.completedSessions, today, 14),
    cycle,
    inProgram,
    easierFor: (id) => (params ? easierVariantFor(id, ctx) : null),
    replacementFor: (id) => (params ? replacementPreview(params, id) : null),
    evolution,
    cycleFacts,
    doneUnder: sessionsDoneUnder(input.records, input.facts.completedSessions),
  };
}
