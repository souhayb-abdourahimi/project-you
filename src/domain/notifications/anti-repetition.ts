/**
 * Anti-repetition and anti-harassment rules of the notification channel (docs/NOTIFICATIONS.md):
 * - trigger cooldowns (one weekly message per week, one streak message per milestone…);
 * - one message per absence step and episode, never more than three per episode, then silence;
 * - fewer messages when the last ones were all ignored.
 * Wording rotation (least recently used parts) lives in the voice (journey/voice/rotation.ts).
 */
import { daysBetween } from '../shared/dates';
import type { NotificationHistoryEntry, Trigger } from './types';

/** Minimum days between two messages of the same trigger. */
export const COOLDOWN_DAYS: Partial<Record<Trigger, number>> = {
  weigh_in: 6,
  weekly_progress: 6,
  weekly_checkin: 6,
  success_streak: 6,
  fatigue_recovery: 2,
  safety_low_intake: 3,
  safety_fast_loss: 3,
  safety_training_load: 3,
};

const ABSENCE: Trigger[] = ['absence_gentle', 'absence_comeback', 'absence_last'];

/** After this many delivered messages in a row without any opened, the daily cap drops by one. */
export const IGNORED_STREAK = 5;

export function onCooldown(
  candidate: { trigger: Trigger; date: string; facts: Record<string, string> },
  history: NotificationHistoryEntry[],
): boolean {
  const { trigger, date, facts } = candidate;
  const sameTrigger = history.filter((e) => e.trigger === trigger);
  // Already sent that day (e.g. the user moved the reminder time after it was delivered).
  if (sameTrigger.some((e) => e.date === date)) return true;
  if (ABSENCE.includes(trigger)) {
    // One message per step for a given absence episode (identified by the last active day).
    return sameTrigger.some((e) => e.facts.since === facts.since);
  }
  if (trigger === 'success_streak' && sameTrigger.some((e) => e.facts.weeks === facts.weeks)) return true;
  const days = COOLDOWN_DAYS[trigger];
  if (!days) return false;
  return sameTrigger.some((e) => Math.abs(daysBetween(e.date, date)) < days);
}

/** Daily cap lowered by one (never below one) when the user ignored the last messages. */
export function effectiveDailyCap(maxPerDay: number, history: NotificationHistoryEntry[]): number {
  const past = history
    .filter((e) => e.status === 'delivered' || e.status === 'opened')
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const last = past.slice(-IGNORED_STREAK);
  const ignored = last.length === IGNORED_STREAK && last.every((e) => e.status === 'delivered');
  return ignored ? Math.max(1, maxPerDay - 1) : maxPerDay;
}
