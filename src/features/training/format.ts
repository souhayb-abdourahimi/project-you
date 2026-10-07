import type { TFunction } from 'i18next';

import type { LoggedSet } from '@/domain/training/progression';
import type { Performance } from '@/domain/training/session';
import { formatNumber } from '@/lib/format';

/** "70 kg × 9", "12 reps", "40 s": one set (or the best set of last time) as the user reads it. */
export function setValue(t: TFunction, locale: string, set: LoggedSet | Performance): string {
  const load = set.loadKg > 0 ? formatNumber(set.loadKg, locale) : null;
  const seconds = 'date' in set ? set.seconds : (set.seconds ?? null);
  if (seconds !== null)
    return load ? t('workout.value.loadSeconds', { load, seconds }) : t('workout.value.seconds', { seconds });
  return load ? t('workout.value.load', { load, reps: set.reps }) : t('workout.value.reps', { reps: set.reps });
}
