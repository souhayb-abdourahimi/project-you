/**
 * Notification channel of the Transformation Journey Engine (docs/NOTIFICATIONS.md, D-024):
 * device preferences, scheduled reminders and their history. What to say comes from the
 * journey's voice (journey/voice); this channel decides when and how often.
 */
import type { AnchorSlot, ComposedMessage, Trigger } from '../journey/voice/types';
import type { IsoDate } from '../shared/dates';

export type { AnchorSlot, ComposedMessage, MessagePart, Trigger } from '../journey/voice/types';

export const NOTIFICATION_CATEGORIES = [
  'training',
  'meals',
  'weigh_in',
  'shopping',
  'progress',
  'motivation',
  'calendar',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const TRIGGER_CATEGORY: Record<Trigger, NotificationCategory> = {
  session_planned: 'training',
  session_planned_tired: 'training',
  meal_planned: 'meals',
  weigh_in: 'weigh_in',
  shopping: 'shopping',
  weekly_progress: 'progress',
  weekly_checkin: 'progress',
  success_session: 'motivation',
  success_streak: 'progress',
  absence_gentle: 'motivation',
  absence_comeback: 'motivation',
  absence_last: 'motivation',
  fatigue_recovery: 'motivation',
  daily_why: 'motivation',
  // Safety messages are sent whatever the category switches (CLAUDE.md rule 8); listed under progress.
  safety_low_intake: 'progress',
  safety_fast_loss: 'progress',
  safety_training_load: 'progress',
};

export interface PlannedNotification extends ComposedMessage {
  /** `${date}:${trigger}`: one message per trigger and day. */
  id: string;
  trigger: Trigger;
  category: NotificationCategory;
  date: IsoDate;
  /** Local "HH:MM". */
  time: string;
}

export type HistoryStatus = 'scheduled' | 'delivered' | 'opened';

/**
 * One message this device scheduled. Stores which template parts were used, never the rendered
 * text (the user's own words stay in the motivations table only).
 */
export interface NotificationHistoryEntry {
  id: string;
  trigger: Trigger;
  category: NotificationCategory;
  templateId: string;
  anchorSlot: AnchorSlot;
  date: IsoDate;
  time: string;
  status: HistoryStatus;
  /** Facts the trigger depended on (e.g. the absence episode start), for per-episode cooldowns. */
  facts: Record<string, string>;
  scheduledAt: string;
  openedAt?: string;
}

export interface NotificationPreferences {
  /** Master switch; off by default until the user opts in (permission asked at that moment). */
  enabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  /** "22:00" → "07:30": nothing is scheduled inside. */
  quietStart: string;
  quietEnd: string;
  maxPerDay: number;
  /** Local times chosen by the user. */
  mealReminderTime: string;
  motivationTime: string;
  /** ISO weekday (1 = Monday) for the weekly weigh-in. */
  weighInDay: number;
  weighInTime: string;
  /** Quote the user's own words (why / change / feel). Off → generic anchor, nothing personal on the lock screen. */
  quotePersonalWords: boolean;
  /** Gentle messages after a few days without activity (at most three, then silence). */
  absenceReminders: boolean;
  /** Messages after a completed session or a weekly streak. */
  celebrations: boolean;
  /** Nothing is scheduled before this date (holidays, illness, a break the user chose). */
  pausedUntil: IsoDate | null;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  categories: {
    training: true,
    meals: false,
    weigh_in: true,
    shopping: true,
    progress: true,
    motivation: false,
    calendar: false,
  },
  quietStart: '22:00',
  quietEnd: '07:30',
  maxPerDay: 3,
  mealReminderTime: '12:00',
  motivationTime: '08:30',
  weighInDay: 1,
  weighInTime: '08:00',
  quotePersonalWords: true,
  absenceReminders: true,
  celebrations: true,
  pausedUntil: null,
};
