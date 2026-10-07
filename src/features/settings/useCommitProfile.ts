import { type ProfileImpact, replacementRows } from '@/domain/settings/impact';
import type { UserContextSnapshot } from '@/domain/profile/schemas';
import { toIsoDate } from '@/domain/shared/dates';
import { newId } from '@/lib/id';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

/**
 * Saves an edited profile (D-043): first the journal rows that end the adaptations the new
 * settings replace (append-only), then the profile. The program, the week and the meals follow
 * from the existing mechanisms (`ensureProgram`, `ensureWeek`, the meal plan key): nothing else is
 * written here, and nothing of the past is rewritten.
 */
export function commitProfile(next: UserContextSnapshot, impact: Pick<ProfileImpact, 'replaced'>) {
  const now = new Date();
  for (const row of replacementRows(impact, {
    ids: impact.replaced.map(() => newId()),
    today: toIsoDate(now),
    decidedAt: now.toISOString(),
  })) {
    useDataStore.getState().saveAdjustment(row);
  }
  useProfileStore.getState().setSnapshot(next);
}
