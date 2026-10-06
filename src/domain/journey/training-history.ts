/**
 * Training history (W-6, D-038): week by week, what was planned and done (facts, `compare.ts`),
 * the program versions published that week with their reason, and every answer the user gave to
 * a training proposal (the `adjustments` journal, append-only, D-037) with what was observed
 * after it (facts, never a cause). Pure and derived: nothing here is stored.
 */
import { addDays, startOfWeek, type IsoDate } from '../shared/dates';
import { compareWeek, type CompareFacts, type WeekComparison } from '../training/compare';
import type { ProgramVersion } from '../training/program';
import { isStructural, structureKey } from '../training/structure';
import { activeProgram, type TrainingRecords } from '../training/week';
import { effectiveDecisions, type Adjustment } from './adjustments';
import type { AdaptationEffect } from './structural';

/** A training decision as the history shows it. */
export interface DecisionEntry {
  decision: Adjustment;
  /** What it changes (`light_week` for an end-of-cycle light week). */
  change: string;
  /** Before / after facts for an applied structural change. */
  effect: AdaptationEffect | null;
  /** This answer is the one in force for its proposal (later answers replace it, D-037). */
  inForce: boolean;
}

export interface HistoryWeek {
  weekStart: IsoDate;
  week: WeekComparison;
  /** Versions of the current lineage that started this week (an archived one never shows as new). */
  versions: ProgramVersion[];
  decisions: DecisionEntry[];
}

/** A decision about training (calories and spending stay in their own screens). */
export function isTrainingDecision(d: Adjustment): boolean {
  return isStructural(structureKey(d) ?? d.changeKey);
}

/** The journal of training decisions, newest first, answers only (never the bare proposal). */
export function decisionJournal(
  adjustments: readonly Adjustment[],
  effects: readonly AdaptationEffect[] = [],
): DecisionEntry[] {
  const current = new Set([...effectiveDecisions(adjustments).values()].map((d) => d.id));
  return adjustments
    .filter((d) => d.status !== 'proposed' && isTrainingDecision(d))
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt) || b.id.localeCompare(a.id))
    .map((d) => ({
      decision: d,
      change: structureKey(d) ?? d.changeKey,
      effect: effects.find((e) => e.decisionId === d.id) ?? null,
      inForce: current.has(d.id),
    }));
}

/**
 * The last `weeks` weeks, newest first. A past week with nothing in it (no session, no version, no
 * answer) is left out; the current week is always there.
 */
export function trainingHistory(input: {
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds' | 'programs'>;
  facts: CompareFacts;
  adjustments: readonly Adjustment[];
  effects?: readonly AdaptationEffect[];
  today: IsoDate;
  weeks: number;
}): HistoryWeek[] {
  const { records, facts, today } = input;
  const current = startOfWeek(today);
  const journal = decisionJournal(input.adjustments, input.effects);
  // A version archived after a sync conflict lives in its own lineage (D-033): not shown as new.
  const lineage = activeProgram(records.programs)?.lineageId ?? null;
  const out: HistoryWeek[] = [];
  for (let i = 0; i < input.weeks; i++) {
    const weekStart = addDays(current, -7 * i);
    const end = addDays(weekStart, 6);
    const inWeek = (d: IsoDate) => d >= weekStart && d <= end;
    const week = compareWeek({ records, facts, weekStart, today });
    const versions = records.programs
      .filter((p) => p.source === 'engine' && inWeek(p.effectiveFrom) && (lineage === null || p.lineageId === lineage))
      .sort((a, b) => a.version - b.version);
    const decisions = journal.filter((e) => inWeek(e.decision.decidedAt.slice(0, 10)));
    if (i > 0 && week.sessions.length === 0 && versions.length === 0 && decisions.length === 0) continue;
    out.push({ weekStart, week, versions, decisions });
  }
  return out;
}
