/**
 * The coach's voice: what the Transformation Journey Engine can say, on any channel
 * (notifications today, the Today screen next). Every message is built from three parts:
 * why the user started (anchor), one small action to do now, and why that action matters.
 * Parts are i18n keys; nothing is generated per message.
 */
import type { GoalType } from '../../profile/schemas';

/** Why the coach speaks. */
export const TRIGGERS = [
  'session_planned',
  'session_planned_tired',
  'meal_planned',
  'weigh_in',
  'shopping',
  'weekly_progress',
  'weekly_checkin',
  'success_session',
  'success_streak',
  'absence_gentle',
  'absence_comeback',
  'absence_last',
  'fatigue_recovery',
  'daily_why',
  'safety_low_intake',
  'safety_fast_loss',
  'safety_training_load',
  'safety_low_logging',
  // Daily Coach (D-028): first day, comeback, difficult day, rest day, tip, reflection, progress,
  // milestone and encouragement. Screen and notifications share them.
  'first_day',
  'comeback_welcome',
  'difficult_day',
  'rest_day',
  'daily_tip',
  'daily_reflection',
  'progress_note',
  'milestone_reached',
  'encouragement_kept_going',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

/**
 * Messages of the safety rule (journey/safety.ts): they slow down, never push. `safety_low_logging`
 * is the neutral check-in of the low-logging signal (D-027): not a safety message, it slows nothing
 * down; it is listed here so it reaches the user whatever the category switches.
 */
export const SAFETY_TRIGGERS: readonly Trigger[] = [
  'safety_low_intake',
  'safety_fast_loss',
  'safety_training_load',
  'safety_low_logging',
];

/**
 * Which of the user's own answers the message recalls. `private`: hidden on the lock screen;
 * `none`: no answer given; `care`: safety messages, which never lean on the goal; `checkin`: the
 * neutral low-logging check-in, which neither leans on the goal nor sounds like a warning.
 */
export type AnchorSlot = 'why' | 'change' | 'feel' | 'private' | 'none' | 'care' | 'checkin';

export type Tone = 'gentle' | 'direct';

/** Goal families: the "why it matters" part differs between losing weight and building strength. */
export type GoalFamily = 'lose' | 'gain' | 'recomp' | 'health' | 'performance';

export const goalFamily = (goal: GoalType): GoalFamily =>
  goal === 'fat_loss' || goal === 'weight_loss'
    ? 'lose'
    : goal === 'muscle_gain'
      ? 'gain'
      : goal === 'recomposition'
        ? 'recomp'
        : goal === 'performance'
          ? 'performance'
          : 'health';

export interface MessagePart {
  key: string;
  params: Record<string, string>;
}

export interface ComposedMessage {
  /** `${trigger}|${titleId}|${slot}.${anchorId}|${actionId}|${meaningId}`: what anti-repetition compares. */
  templateId: string;
  anchorSlot: AnchorSlot;
  title: MessagePart;
  /** Always [anchor, action, meaning], in that order. */
  body: [MessagePart, MessagePart, MessagePart];
}

/** A message the voice already used on some channel (for rotation). */
export interface VoiceUse {
  templateId: string;
  anchorSlot: AnchorSlot;
  date: string;
  time: string;
  /** Where it was said; notifications when absent (history written before D-028). */
  channel?: 'screen' | 'notification';
}
