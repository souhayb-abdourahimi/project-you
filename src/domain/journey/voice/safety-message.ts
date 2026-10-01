import type { SafetyAssessment, SafetyFlag } from '../safety';
import type { Trigger } from './types';

const SAFETY_MESSAGE: Record<SafetyFlag, Trigger> = {
  low_intake: 'safety_low_intake',
  fast_weight_loss: 'safety_fast_loss',
  training_load: 'safety_training_load',
};

/** The message the safety rule asks every channel to show (most important flag), or null. */
export function safetyMessageFor(safety: SafetyAssessment): { trigger: Trigger; facts: Record<string, string> } | null {
  const [flag] = safety.flags;
  if (!safety.active || !flag) return null;
  return {
    trigger: SAFETY_MESSAGE[flag],
    facts: flag === 'low_intake' && safety.belowFloor ? { below_floor: '1' } : {},
  };
}
