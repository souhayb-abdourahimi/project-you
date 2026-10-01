/**
 * Device history of the messages scheduled by this app. Local notifications are scheduled ahead,
 * so on every re-plan:
 * - entries whose time has passed while still scheduled become `delivered`;
 * - entries still in the future are dropped: the new plan replaces them;
 * - entries older than HISTORY_DAYS are pruned.
 * The history stores template ids, never the rendered text.
 */
import { addDays, type IsoDate } from '../shared/dates';
import type { NotificationHistoryEntry, PlannedNotification } from './types';

export const HISTORY_DAYS = 90;

export interface Moment {
  date: IsoDate;
  time: string;
}

const isBefore = (e: Moment, now: Moment) => e.date < now.date || (e.date === now.date && e.time <= now.time);

export function reconcileHistory(history: NotificationHistoryEntry[], now: Moment): NotificationHistoryEntry[] {
  const oldest = addDays(now.date, -HISTORY_DAYS);
  return history.flatMap((e) => {
    if (e.date < oldest) return [];
    if (e.status !== 'scheduled') return [e];
    return isBefore(e, now) ? [{ ...e, status: 'delivered' as const }] : [];
  });
}

/** Adds the new plan as `scheduled` entries (replacing any entry with the same id). */
export function recordPlanned(
  history: NotificationHistoryEntry[],
  planned: (PlannedNotification & { facts?: Record<string, string> })[],
  scheduledAt: string,
): NotificationHistoryEntry[] {
  const ids = new Set(planned.map((p) => p.id));
  return [
    ...history.filter((e) => !ids.has(e.id)),
    ...planned.map((p): NotificationHistoryEntry => ({
      id: p.id,
      trigger: p.trigger,
      category: p.category,
      templateId: p.templateId,
      anchorSlot: p.anchorSlot,
      date: p.date,
      time: p.time,
      status: 'scheduled',
      facts: p.facts ?? {},
      scheduledAt,
    })),
  ];
}

/** The user tapped the notification. */
export function markOpened(history: NotificationHistoryEntry[], id: string, at: string): NotificationHistoryEntry[] {
  return history.map((e) => (e.id === id ? { ...e, status: 'opened', openedAt: at } : e));
}

/** True when the two histories hold the same entries (avoids needless store writes). */
export function sameHistory(a: NotificationHistoryEntry[], b: NotificationHistoryEntry[]): boolean {
  if (a.length !== b.length) return false;
  const key = (e: NotificationHistoryEntry) => `${e.id}|${e.status}|${e.templateId}|${e.time}|${e.openedAt ?? ''}`;
  const left = new Set(a.map(key));
  return b.every((e) => left.has(key(e)));
}
