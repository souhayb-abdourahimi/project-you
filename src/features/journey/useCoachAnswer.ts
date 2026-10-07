import { blockerAnswer, shortDayAnswer, type Blocker, type CoachMemoryItem } from '@/domain/journey/coach-memory';
import type { CoachQuestion } from '@/domain/journey/coach';
import { revertDecision } from '@/domain/journey/adjustments';
import type { IsoDate } from '@/domain/shared/dates';
import { newId } from '@/lib/id';
import { useDataStore } from '@/state/data';

/**
 * The user's answers to the coach (W-7, D-039), each one a new row of the synced journal: the cause
 * picked, "Pas maintenant", a preference confirmed or declined, and "Oublier". Nothing is rewritten.
 */
export function useCoachAnswer(today: IsoDate) {
  const saveAdjustment = useDataStore((s) => s.saveAdjustment);
  const decidedAt = () => new Date().toISOString();
  return {
    answer: (q: CoachQuestion, value: string | null) => {
      if (q.kind === 'blocker') {
        saveAdjustment(
          blockerAnswer({
            id: newId(),
            cause: value as Blocker | null,
            status: value ? 'applied' : 'postponed',
            notHappened: q.notHappened ?? 0,
            today,
            decidedAt: decidedAt(),
          }),
        );
        return;
      }
      if (q.weekday === undefined) return;
      saveAdjustment(
        shortDayAnswer({
          id: newId(),
          weekday: q.weekday,
          count: q.count ?? 0,
          status: value === 'yes' ? 'applied' : value === 'no' ? 'declined' : 'postponed',
          today,
          decidedAt: decidedAt(),
        }),
      );
    },
    forget: (item: CoachMemoryItem) =>
      saveAdjustment(revertDecision(item.decision, { id: newId(), today, decidedAt: decidedAt() })),
  };
}
