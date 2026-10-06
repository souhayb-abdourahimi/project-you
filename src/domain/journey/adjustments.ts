/**
 * Adaptation decisions (docs/ADAPTATION_ENGINE.md §9, D-037): the journal of what the Adaptation
 * Engine proposed and what the user decided. Append-only: a decision is never rewritten; a later
 * decision on the same proposal (revert, a second device) is a new row, and the latest one is the
 * one in force. Nothing is deleted, so the history keeps every proposal, refusal and revert.
 */
import { addDays, daysBetween, startOfWeek, type IsoDate } from '../shared/dates';

export const ADAPTATION_KINDS = [
  'nutrition',
  'training',
  'planning',
  'reduce_load',
  'add_recovery',
  'simplify_tracking',
] as const;
export type AdaptationKind = (typeof ADAPTATION_KINDS)[number] | 'none';

export const DECISION_STATUSES = ['proposed', 'applied', 'declined', 'reverted', 'postponed'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/**
 * How long a structural adaptation lasts (D-037 §17): a known end, always. `sessions` ends after
 * `sessionCount` sessions done under it, or at `effectiveTo`, whichever comes first.
 */
export const ADJUSTMENT_SCOPES = ['session', 'sessions', 'week', 'weeks', 'durable'] as const;
export type AdjustmentScope = (typeof ADJUSTMENT_SCOPES)[number];

export interface Adjustment {
  id: string;
  kind: (typeof ADAPTATION_KINDS)[number];
  /** What changes (`calories_per_day`, `sessions_per_week`, `light_week`…). */
  changeKey: string;
  from: number | string | null;
  to: number | string | null;
  reasonKey: string;
  evidence: Record<string, string | number>;
  /** `postponed`: "pas maintenant", proposed again later if the signal is still there. */
  status: DecisionStatus;
  effectiveFrom: IsoDate;
  decidedAt: string;
  /** The proposal this decision answers (stable on every device); absent on rows before W-5. */
  proposalId?: string | null;
  scope?: AdjustmentScope | null;
  /** Last day covered (inclusive); null for a durable change. */
  effectiveTo?: IsoDate | null;
  sessionCount?: number | null;
}

/** Identifies a recommendation across openings: one per change and week. */
export function recommendationKey(kind: AdaptationKind, changeKey: string, weekStart: IsoDate): string {
  return `${kind}:${changeKey}:${weekStart}`;
}

/**
 * Stable id of a proposal (D-037 §30): the same signal the same week gives the same id on every
 * device. A targeted proposal (an exercise) carries its target in the change key part.
 */
export function proposalKey(kind: AdaptationKind, changeKey: string, target: string | null, weekStart: IsoDate) {
  return recommendationKey(kind, target ? `${changeKey}.${target}` : changeKey, weekStart);
}

/**
 * The proposal a decision answered: the stored id since W-5; before, the week of `effectiveFrom`
 * linked it back to the recommendation.
 */
export function decidedRecommendation(a: Adjustment): string {
  return a.proposalId ?? recommendationKey(a.kind, a.changeKey, startOfWeek(a.effectiveFrom));
}

const byDecision = (a: Adjustment, b: Adjustment) => a.decidedAt.localeCompare(b.decidedAt) || a.id.localeCompare(b.id);

/**
 * The decision in force for each proposal: the latest one (time of the gesture, then id), on every
 * device the same. Two devices that answered differently offline both keep their row; the later
 * gesture wins, the other stays in the journal (never lost silently).
 */
export function effectiveDecisions(adjustments: readonly Adjustment[]): Map<string, Adjustment> {
  const out = new Map<string, Adjustment>();
  for (const a of [...adjustments].sort(byDecision)) {
    if (a.status === 'proposed') continue;
    out.set(decidedRecommendation(a), a);
  }
  return out;
}

/** Decisions overridden by a later one on the same proposal (another device, a revert). */
export function overriddenDecisions(adjustments: readonly Adjustment[]): Adjustment[] {
  const effective = new Set([...effectiveDecisions(adjustments).values()].map((a) => a.id));
  return adjustments.filter((a) => a.status !== 'proposed' && !effective.has(a.id));
}

/** Applied decisions still in force (not reverted, not overridden), oldest first. */
export function appliedDecisions(adjustments: readonly Adjustment[]): Adjustment[] {
  return [...effectiveDecisions(adjustments).values()].filter((a) => a.status === 'applied').sort(byDecision);
}

/**
 * Calorie offset currently applied: `to` of the latest applied `calories_per_day` decision
 * (from/to are offsets in kcal/day against the computed target, e.g. 0 → −120). 0 when none.
 */
export function appliedCalorieOffset(adjustments: Adjustment[]): number {
  const latest = appliedDecisions(adjustments)
    .filter((a) => a.changeKey === 'calories_per_day')
    .at(-1);
  return latest ? Number(latest.to) || 0 : 0;
}

/** Sessions per week chosen through an applied adaptation, or null (the profile value stands). */
export function appliedSessionsPerWeek(adjustments: Adjustment[]): number | null {
  const latest = sessionsPerWeekDecision(adjustments);
  return latest ? Number(latest.to) : null;
}

/** The accepted decision that sets the frequency now (linked to the program version it produces). */
export function sessionsPerWeekDecision(adjustments: Adjustment[]): Adjustment | null {
  return (
    appliedDecisions(adjustments)
      .filter((a) => a.changeKey === 'sessions_per_week')
      .at(-1) ?? null
  );
}

/**
 * A decision on a proposal, as the user made it (pure: id and time come from the caller). The
 * scope and the end are those of the proposal; a postponed or declined proposal has no window.
 */
export function decisionFor(input: {
  id: string;
  proposal: {
    id: string;
    kind: Exclude<AdaptationKind, 'none'>;
    change: { key: string; from?: number | string; to?: number | string };
    reason: { key: string };
    evidence: Record<string, string | number>;
    scope?: { kind: AdjustmentScope; days?: number; sessions?: number } | null;
  };
  status: Exclude<DecisionStatus, 'proposed' | 'reverted'>;
  /** The option chosen when the proposal offers several (end-of-cycle review). */
  option?: string;
  /** The scope of the chosen option, when it differs from the proposal's (`cycleOptionScope`). */
  scope?: { kind: AdjustmentScope; days?: number; sessions?: number } | null;
  today: IsoDate;
  decidedAt: string;
}): Adjustment {
  const { proposal, status, today } = input;
  const chosen = input.scope !== undefined ? input.scope : proposal.scope;
  const scope = status === 'applied' ? (chosen ?? null) : null;
  return {
    id: input.id,
    kind: proposal.kind,
    changeKey: proposal.change.key,
    from: proposal.change.from ?? null,
    to: input.option ?? proposal.change.to ?? null,
    reasonKey: proposal.reason.key,
    evidence: proposal.evidence,
    status,
    effectiveFrom: today,
    decidedAt: input.decidedAt,
    proposalId: proposal.id,
    scope: scope?.kind ?? null,
    effectiveTo: scope?.days ? addDays(today, scope.days - 1) : null,
    sessionCount: scope?.sessions ?? null,
  };
}

/**
 * Going back on an applied adaptation (D-037 §21): a new decision on the same proposal, the
 * applied one stays as it was. What follows the previous structure is prescribed again for the
 * sessions not started yet; the sessions already done keep what they were given (D-033).
 */
export function revertDecision(
  applied: Adjustment,
  input: { id: string; today: IsoDate; decidedAt: string },
): Adjustment {
  return {
    ...applied,
    id: input.id,
    status: 'reverted',
    effectiveFrom: input.today,
    // A revert always comes after what it reverts, even with a coarse or frozen clock.
    decidedAt:
      Date.parse(input.decidedAt) > Date.parse(applied.decidedAt)
        ? input.decidedAt
        : new Date(Date.parse(applied.decidedAt) + 1).toISOString(),
    proposalId: decidedRecommendation(applied),
    scope: null,
    effectiveTo: null,
    sessionCount: null,
  };
}

/** Days since the latest decision with this status on a change (and target), or null. */
export function daysSinceDecision(
  adjustments: readonly Adjustment[],
  changeKey: string,
  statuses: readonly DecisionStatus[],
  today: IsoDate,
  target?: string | number | null,
): number | null {
  const latest = [...effectiveDecisions(adjustments).values()]
    .filter(
      (a) => a.changeKey === changeKey && statuses.includes(a.status) && (target === undefined || a.from === target),
    )
    .sort(byDecision)
    .at(-1);
  return latest ? daysBetween(latest.effectiveFrom, today) : null;
}
