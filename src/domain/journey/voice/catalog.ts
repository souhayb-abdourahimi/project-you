/**
 * The coach's message catalog: which title / anchor / action / meaning variants exist per trigger.
 * The wording lives in the locale files under `coach.*` (fr is the source, en mirrors it) and is
 * checked by the tone guard (tone.ts). Adding a variant = one line here + one string per locale.
 * Fact `safety` (set while the safety rule is active) removes every variant that pushes toward
 * the goal (CLAUDE.md rule 8).
 */
import type { AnchorSlot, GoalFamily, Tone, Trigger } from './types';

export interface Variant {
  id: string;
  /** Only for users who chose this motivation style; untagged variants suit both. */
  tone?: Tone;
  /** Only for these goal families; untagged variants suit every goal. */
  goals?: GoalFamily[];
  /** Facts that must be present (their values are interpolated). */
  needs?: string[];
  /** Facts that must be absent. */
  unless?: string[];
}

export type PartKind = 'title' | 'action' | 'meaning';

const v = (id: string, extra: Omit<Variant, 'id'> = {}): Variant => ({ id, ...extra });

export const ANCHORS: Record<AnchorSlot, Variant[]> = {
  why: [v('v1'), v('v2'), v('v3')],
  change: [v('v1'), v('v2'), v('v3')],
  feel: [v('v1'), v('v2'), v('v3')],
  private: [v('v1'), v('v2'), v('v3')],
  none: [v('v1'), v('v2'), v('v3')],
  care: [v('v1'), v('v2'), v('v3')],
};

export const CATALOG: Record<Trigger, Record<PartKind, Variant[]>> = {
  session_planned: {
    title: [v('v1'), v('v2'), v('v3', { tone: 'direct' })],
    action: [
      v('v1', { unless: ['short'] }),
      v('v2', { unless: ['short'] }),
      v('v3', { unless: ['short'] }),
      v('v4', { tone: 'direct', unless: ['short'] }),
      v('short1', { needs: ['short'] }),
      v('short2', { needs: ['short'] }),
    ],
    meaning: [
      v('v1'),
      v('v2'),
      v('lose', { goals: ['lose'], unless: ['safety'] }),
      v('gain', { goals: ['gain'], unless: ['safety'] }),
      v('recomp', { goals: ['recomp'], unless: ['safety'] }),
      v('health', { goals: ['health'] }),
      v('performance', { goals: ['performance'], unless: ['safety'] }),
    ],
  },
  session_planned_tired: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  meal_planned: {
    title: [v('v1'), v('v2')],
    action: [v('v1', { needs: ['meal'] }), v('v2', { needs: ['meal'] }), v('generic', { unless: ['meal'] })],
    meaning: [
      v('v1'),
      v('lose', { goals: ['lose'], unless: ['safety'] }),
      v('gain', { goals: ['gain', 'recomp'], unless: ['safety'] }),
    ],
  },
  weigh_in: {
    title: [v('v1')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  shopping: {
    title: [v('v1')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  weekly_progress: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2', { needs: ['sessions'] })],
    meaning: [v('v1'), v('v2')],
  },
  weekly_checkin: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  success_session: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2'), v('v3')],
    meaning: [v('v1'), v('v2')],
  },
  success_streak: {
    title: [v('v1', { needs: ['weeks'] })],
    action: [v('v1'), v('v2')],
    meaning: [v('v1', { needs: ['weeks'] }), v('v2')],
  },
  absence_gentle: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  absence_comeback: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  absence_last: {
    title: [v('v1')],
    action: [v('v1')],
    meaning: [v('v1')],
  },
  fatigue_recovery: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  daily_why: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2'), v('v3'), v('v4', { tone: 'direct' })],
    meaning: [v('v1'), v('v2'), v('lose', { goals: ['lose'] }), v('gain', { goals: ['gain', 'recomp'] })],
  },
  safety_low_intake: {
    title: [v('v1'), v('v2')],
    action: [
      v('v1', { unless: ['below_floor'] }),
      v('v2', { unless: ['below_floor'] }),
      v('floor', { needs: ['below_floor'] }),
    ],
    meaning: [v('v1'), v('v2')],
  },
  safety_fast_loss: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
  safety_training_load: {
    title: [v('v1'), v('v2')],
    action: [v('v1'), v('v2')],
    meaning: [v('v1'), v('v2')],
  },
};

export const anchorKey = (slot: AnchorSlot, id: string) => `coach.anchor.${slot}.${id}`;
export const partKey = (trigger: Trigger, kind: PartKind, id: string) => `coach.${kind}.${trigger}.${id}`;

/** Variants usable for this user and these facts, in catalog order. */
export function eligible(
  variants: Variant[],
  ctx: { tone: Tone; family: GoalFamily; facts: Record<string, string> },
): Variant[] {
  return variants.filter(
    (x) =>
      (!x.tone || x.tone === ctx.tone) &&
      (!x.goals || x.goals.includes(ctx.family)) &&
      (x.needs ?? []).every((f) => ctx.facts[f] !== undefined && ctx.facts[f] !== '') &&
      (x.unless ?? []).every((f) => ctx.facts[f] === undefined || ctx.facts[f] === ''),
  );
}
