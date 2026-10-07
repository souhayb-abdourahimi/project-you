import { weightUnitOf } from '@/domain/profile/schemas';
import { useProfileStore } from '@/state/profile';

/** The user's mass unit (D-043): stored values stay in kg, only display and typing use it. */
export function useMassUnit() {
  return useProfileStore((s) => weightUnitOf(s.snapshot));
}
