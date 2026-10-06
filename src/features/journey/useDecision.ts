import type { Recommendation } from '@/domain/journey/adaptation';
import { decisionFor, revertDecision, type Adjustment } from '@/domain/journey/adjustments';
import type { ProposalAnswer } from '@/domain/journey/proposal';
import type { IsoDate } from '@/domain/shared/dates';
import { newId } from '@/lib/id';
import { useDataStore } from '@/state/data';

/**
 * The user's answers to a proposal (D-036, D-037 §18–21), each one a new row of the journal:
 * apply (with the chosen option and its scope), not now, refuse, and going back on an applied
 * change. Nothing is rewritten; a later answer on the same proposal is the one in force.
 */
export function useDecision(today: IsoDate) {
  const saveAdjustment = useDataStore((s) => s.saveAdjustment);
  const decidedAt = () => new Date().toISOString();
  return {
    decide: (r: Recommendation, status: 'applied' | 'declined' | 'postponed', answer?: ProposalAnswer) => {
      if (r.kind === 'none') return;
      saveAdjustment(
        decisionFor({
          id: newId(),
          proposal: {
            id: r.id,
            kind: r.kind,
            change: r.change,
            reason: r.reason,
            evidence: r.evidence,
            scope: r.scope,
          },
          status,
          ...(answer?.option ? { option: answer.option, scope: answer.scope } : {}),
          today,
          decidedAt: decidedAt(),
        }),
      );
    },
    revert: (applied: Adjustment) =>
      saveAdjustment(revertDecision(applied, { id: newId(), today, decidedAt: decidedAt() })),
  };
}
