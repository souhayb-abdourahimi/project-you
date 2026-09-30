/**
 * NotificationEngine (docs/NOTIFICATIONS.md): turns the week plan and the user's preferences into
 * a small list of local reminders. Deterministic and pure; the service only schedules the result.
 * Rules: category opt-in, quiet hours respected, daily cap, never two reminders within an hour,
 * warm wording only (keys in the locale files, reviewed for guilt-free tone).
 */
import type { MotivationProfile } from '../profile/schemas';
import type { WeeklyPlan } from '../planning/engine';
import { dailyMotivation } from '../motivation/messages';
import { addDays, formatTime, parseTime, type IsoDate } from '../shared/dates';

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
  /** ISO weekday (1 = Monday) for the weekly weigh-in and the weekly review. */
  weighInDay: number;
  weighInTime: string;
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
};

export interface PlannedNotification {
  id: string;
  category: NotificationCategory;
  date: IsoDate;
  /** Local "HH:MM". */
  time: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
}

/** Lower number = kept first when the daily cap is reached. */
const PRIORITY: Record<NotificationCategory, number> = {
  training: 0,
  weigh_in: 1,
  meals: 2,
  shopping: 3,
  calendar: 4,
  progress: 5,
  motivation: 6,
};

const MIN_GAP_MINUTES = 60;
const TRAINING_LEAD_MINUTES = 60;

export function isQuiet(time: string, quietStart: string, quietEnd: string): boolean {
  const t = parseTime(time);
  const s = parseTime(quietStart);
  const e = parseTime(quietEnd);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** Moves a reminder out of quiet hours to the end of the quiet period, or drops it. */
function outOfQuietHours(time: string, prefs: NotificationPreferences): string | null {
  if (!isQuiet(time, prefs.quietStart, prefs.quietEnd)) return time;
  // Before the quiet end on the same morning → move to the quiet end; late evening → drop.
  return parseTime(time) < parseTime(prefs.quietEnd) ? prefs.quietEnd : null;
}

export function planNotifications(input: {
  prefs: NotificationPreferences;
  week: WeeklyPlan;
  motivation: MotivationProfile;
  /** Only reminders at or after this moment are planned. */
  from: { date: IsoDate; time: string };
  /** Sessions already done (`${date}#${index}`): no reminder for them. */
  completed?: string[];
}): PlannedNotification[] {
  const { prefs, week, motivation, from } = input;
  if (!prefs.enabled) return [];
  const completed = new Set(input.completed ?? []);
  const candidates: PlannedNotification[] = [];
  const add = (n: Omit<PlannedNotification, 'id'>) => {
    if (!prefs.categories[n.category]) return;
    const time = outOfQuietHours(n.time, prefs);
    if (!time) return;
    if (n.date < from.date || (n.date === from.date && time < from.time)) return;
    candidates.push({ ...n, time, id: `${n.date}:${n.category}:${n.titleKey}` });
  };

  for (const day of week.days) {
    for (const item of day.items) {
      if (item.kind === 'workout' && item.start && !completed.has(`${day.date}#${item.sessionIndex}`)) {
        add({
          category: 'training',
          date: day.date,
          time: formatTime(Math.max(0, parseTime(item.start) - TRAINING_LEAD_MINUTES)),
          titleKey: 'notifications.messages.training.title',
          bodyKey:
            item.variant === 'short'
              ? 'notifications.messages.training.body_short'
              : 'notifications.messages.training.body',
          params: { time: item.start },
        });
      }
      if (item.kind === 'shopping') {
        add({
          category: 'shopping',
          date: day.date,
          time: item.start,
          titleKey: 'notifications.messages.shopping.title',
          bodyKey: 'notifications.messages.shopping.body',
          params: {},
        });
      }
    }
    add({
      category: 'meals',
      date: day.date,
      time: prefs.mealReminderTime,
      titleKey: 'notifications.messages.meals.title',
      bodyKey: 'notifications.messages.meals.body',
      params: {},
    });
    if (day.weekday === prefs.weighInDay) {
      add({
        category: 'weigh_in',
        date: day.date,
        time: prefs.weighInTime,
        titleKey: 'notifications.messages.weigh_in.title',
        bodyKey: 'notifications.messages.weigh_in.body',
        params: {},
      });
    }
    if (day.weekday === 7) {
      add({
        category: 'progress',
        date: day.date,
        time: '18:00',
        titleKey: 'notifications.messages.progress.title',
        bodyKey: 'notifications.messages.progress.body',
        params: {},
      });
    }
    const message = dailyMotivation(motivation, day.date);
    add({
      category: 'motivation',
      date: day.date,
      time: prefs.motivationTime,
      titleKey: 'notifications.messages.motivation.title',
      bodyKey: message.key,
      params: message.params,
    });
  }

  // Per day: highest priority first, respect the cap and the minimum gap.
  const kept: PlannedNotification[] = [];
  const days = [...new Set(candidates.map((c) => c.date))].sort();
  for (const date of days) {
    const today: PlannedNotification[] = [];
    for (const c of candidates
      .filter((x) => x.date === date)
      .sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category] || a.time.localeCompare(b.time))) {
      if (today.length >= prefs.maxPerDay) break;
      if (today.some((k) => Math.abs(parseTime(k.time) - parseTime(c.time)) < MIN_GAP_MINUTES)) continue;
      today.push(c);
    }
    kept.push(...today.sort((a, b) => a.time.localeCompare(b.time)));
  }
  return kept;
}

/** Next week's start helper for rescheduling at the end of the week. */
export const nextWeekStart = (weekStart: IsoDate) => addDays(weekStart, 7);
