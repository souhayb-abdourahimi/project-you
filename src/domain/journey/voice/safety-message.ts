import type { SafetyAssessment, SafetyFlag } from '../safety';
import type { Trigger } from './types';

const SAFETY_MESSAGE: Record<SafetyFlag, Trigger> = {
  low_intake: 'safety_low_intake',
  fast_weight_loss: 'safety_fast_loss',
  training_load: 'safety_training_load',
};

/**
 * The message the safety rule asks every channel to show (most important flag), or null. Without
 * any flag, the neutral low-logging check-in (`safety_low_logging`) when that signal is present: it
 * never replaces a real safety message.
 * Facts pick the wording: `below_floor`, `sparse` (weight trend from infrequent weigh-ins, said to be
 * imprecise), `frequency` (load seen on frequency alone), `since` (low-logging episode, one message each).
 */
export function safetyMessageFor(safety: SafetyAssessment): { trigger: Trigger; facts: Record<string, string> } | null {
  const [flag] = safety.flags;
  if (!safety.active || !flag) {
    return safety.lowLogging ? { trigger: 'safety_low_logging', facts: { since: safety.lowLogging.since } } : null;
  }
  const facts: Record<string, string> = {};
  if (flag === 'low_intake' && safety.belowFloor) facts.below_floor = '1';
  if (flag === 'fast_weight_loss' && safety.weightPrecision === 'sparse') facts.sparse = '1';
  if (flag === 'training_load' && safety.trainingLoadBasis === 'frequency') facts.frequency = '1';
  return { trigger: SAFETY_MESSAGE[flag], facts };
}
