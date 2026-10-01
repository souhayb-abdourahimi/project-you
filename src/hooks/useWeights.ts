import { mergeWeights, type WeightPoint } from '@/domain/health/merge';
import { useDataStore } from '@/state/data';
import { useHealthStore } from '@/state/health';

/**
 * Weigh-ins for trends: manual entries plus those imported from Apple Health / Health Connect
 * (a manual entry wins on the same day, D-018).
 */
export function useWeights(): WeightPoint[] {
  const manual = useDataStore((s) => s.weights);
  const imported = useHealthStore((s) => s.data.weights);
  const sharing = useHealthStore((s) => s.connected && s.wanted.includes('weight'));
  return mergeWeights(manual, sharing ? imported : []);
}
