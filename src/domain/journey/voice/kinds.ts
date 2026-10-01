/**
 * Message kinds and anchor contexts of the coach's voice (docs/DAILY_COACH.md §6, docs/RETENTION.md §3).
 * - Kinds keep the coach from saying the same kind of thing every day ("Tu peux le faire 💪" daily).
 * - Anchor contexts pick which of the user's own answers (why / change / feel) fits the moment;
 *   the three are never concatenated.
 */
import { addDays } from '../../shared/dates';
import type { Trigger, VoiceUse } from './types';

export const MESSAGE_KINDS = [
  'motivation',
  'encouragement',
  'progression',
  'rappel',
  'celebration',
  'retour',
  'conseil',
  'reflexion',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const TRIGGER_KIND: Record<Trigger, MessageKind> = {
  session_planned: 'rappel',
  session_planned_tired: 'rappel',
  meal_planned: 'rappel',
  weigh_in: 'rappel',
  shopping: 'rappel',
  weekly_checkin: 'rappel',
  weekly_progress: 'progression',
  success_streak: 'progression',
  progress_note: 'progression',
  success_session: 'celebration',
  milestone_reached: 'celebration',
  absence_gentle: 'retour',
  absence_comeback: 'retour',
  absence_last: 'retour',
  comeback_welcome: 'retour',
  fatigue_recovery: 'conseil',
  rest_day: 'conseil',
  daily_tip: 'conseil',
  // Safety messages slow down and explain: advice, never motivation.
  safety_low_intake: 'conseil',
  safety_fast_loss: 'conseil',
  safety_training_load: 'conseil',
  safety_low_logging: 'reflexion',
  daily_why: 'motivation',
  first_day: 'motivation',
  difficult_day: 'encouragement',
  encouragement_kept_going: 'encouragement',
  daily_reflection: 'reflexion',
};

/** Same kind at most this many days in a row for the coach message on the screen. */
export const MAX_SAME_KIND_IN_A_ROW = 2;

export const triggerOf = (templateId: string) => templateId.split('|')[0] as Trigger;

/** Kinds of the screen messages of the last days, most recent first (one per day). */
export function recentScreenKinds(
  history: VoiceUse[],
  today: string,
  days = MAX_SAME_KIND_IN_A_ROW,
): (MessageKind | null)[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -(i + 1));
    const use = history.find((u) => u.channel === 'screen' && u.date === date);
    return use ? (TRIGGER_KIND[triggerOf(use.templateId)] ?? null) : null;
  });
}

/** True when this kind was used on the screen every one of the last MAX_SAME_KIND_IN_A_ROW days. */
export function kindTooRepeated(kind: MessageKind, history: VoiceUse[], today: string): boolean {
  return recentScreenKinds(history, today).every((k) => k === kind);
}

/** Which answer fits which moment (docs/DAILY_COACH.md §6.1). */
export type AnchorContext = 'training' | 'rest' | 'comeback' | 'progress' | 'default';

export const ANCHOR_ORDER: Record<AnchorContext, ('why' | 'change' | 'feel')[]> = {
  training: ['change', 'why', 'feel'],
  rest: ['feel', 'why', 'change'],
  comeback: ['why', 'feel', 'change'],
  progress: ['change', 'feel', 'why'],
  default: ['why', 'change', 'feel'],
};

export const TRIGGER_ANCHOR_CONTEXT: Partial<Record<Trigger, AnchorContext>> = {
  session_planned: 'training',
  session_planned_tired: 'rest',
  first_day: 'training',
  rest_day: 'rest',
  fatigue_recovery: 'rest',
  difficult_day: 'rest',
  daily_tip: 'rest',
  daily_reflection: 'rest',
  encouragement_kept_going: 'rest',
  absence_gentle: 'comeback',
  absence_comeback: 'comeback',
  absence_last: 'comeback',
  comeback_welcome: 'comeback',
  weekly_progress: 'progress',
  success_session: 'progress',
  success_streak: 'progress',
  milestone_reached: 'progress',
  progress_note: 'progress',
};

/**
 * The answer to quote: the first given one in the context's order, unless it was already quoted
 * the day before or earlier the same day (any channel); then the next one. Deterministic.
 */
export function pickAnchorSlot(
  given: ('why' | 'change' | 'feel')[],
  context: AnchorContext,
  history: Pick<VoiceUse, 'anchorSlot' | 'date'>[],
  date: string,
): 'why' | 'change' | 'feel' | null {
  const order = ANCHOR_ORDER[context].filter((s) => given.includes(s));
  if (order.length === 0) return null;
  const yesterday = addDays(date, -1);
  const recent = new Set(history.filter((u) => u.date === date || u.date === yesterday).map((u) => u.anchorSlot));
  return (
    order.find((s) => !recent.has(s)) ??
    order.find((s) => !history.some((u) => u.date === date && u.anchorSlot === s)) ??
    order[0]
  );
}
