import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import { palette } from '@/theme/tokens';

import type { AppCalendarEventInput, CalendarBusyEvent, CalendarProvider, ProviderResult } from './types';

const APP_CALENDAR_KEY = 'py.calendar.appCalendarId';
const APP_CALENDAR_TITLE = 'Project You';

const ok = <T>(data: T): ProviderResult<T> => ({
  status: 'ok',
  data,
  meta: {
    provider: 'device-calendar',
    externalId: null,
    source: Platform.OS === 'ios' ? 'EventKit' : 'Android Calendar Provider',
    fetchedAt: new Date().toISOString(),
    updatedAt: null,
    confidence: 'high',
    isMock: false,
  },
});
const denied = { status: 'unavailable', reason: 'permission_denied' } as const;
const failed = { status: 'error', error: 'unknown', retryable: true } as const;

async function granted(): Promise<boolean> {
  try {
    return (await Calendar.getCalendarPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function storedAppCalendarId(): Promise<string | null> {
  const id = await AsyncStorage.getItem(APP_CALENDAR_KEY);
  if (!id) return null;
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.some((c) => c.id === id)) return id;
  await AsyncStorage.removeItem(APP_CALENDAR_KEY);
  return null;
}

/** The app's own calendar, created on first write. */
async function appCalendarId(): Promise<string> {
  const existing = await storedAppCalendarId();
  if (existing) return existing;
  const source =
    Platform.OS === 'ios'
      ? (await Calendar.getDefaultCalendarAsync()).source
      : { isLocalAccount: true, name: APP_CALENDAR_TITLE, type: Calendar.SourceType.LOCAL };
  const id = await Calendar.createCalendarAsync({
    title: APP_CALENDAR_TITLE,
    color: palette.light.primary,
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source.id,
    source,
    name: 'projectyou',
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  await AsyncStorage.setItem(APP_CALENDAR_KEY, id);
  return id;
}

/** True only for an event stored in the app calendar: the guard before any update or delete. */
async function isAppEvent(id: string): Promise<boolean> {
  const calendarId = await storedAppCalendarId();
  if (!calendarId) return false;
  try {
    return (await Calendar.getEventAsync(id)).calendarId === calendarId;
  } catch {
    return false;
  }
}

const details = (e: AppCalendarEventInput) => ({
  title: e.title,
  startDate: e.start,
  endDate: e.end,
  notes: e.notes,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

/** Device calendar (iOS EventKit / Android Calendar Provider) through expo-calendar. */
export const deviceCalendarProvider: CalendarProvider = {
  async requestAccess() {
    try {
      const { granted: ok_ } = await Calendar.requestCalendarPermissionsAsync();
      return ok_ ? ok(true as const) : denied;
    } catch {
      return failed;
    }
  },

  async busyEvents(from, to) {
    if (!(await granted())) return denied;
    try {
      const own = await storedAppCalendarId();
      const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => c.id !== own);
      if (calendars.length === 0) return ok<CalendarBusyEvent[]>([]);
      const events = await Calendar.getEventsAsync(
        calendars.map((c) => c.id),
        from,
        to,
      );
      // Only the time range leaves this function: no title, place or attendee is kept.
      return ok(
        events
          .filter((e) => e.availability !== Calendar.Availability.FREE && e.status !== Calendar.EventStatus.CANCELED)
          .map((e) => ({
            start: new Date(e.startDate).toISOString(),
            end: new Date(e.endDate).toISOString(),
            allDay: !!e.allDay,
          })),
      );
    } catch {
      return failed;
    }
  },

  async createAppEvent(event) {
    if (!(await granted())) return denied;
    try {
      return ok(await Calendar.createEventAsync(await appCalendarId(), details(event)));
    } catch {
      return failed;
    }
  },

  async updateAppEvent(id, event) {
    if (!(await granted())) return denied;
    if (!(await isAppEvent(id))) return denied;
    try {
      await Calendar.updateEventAsync(id, details(event));
      return ok(true as const);
    } catch {
      return failed;
    }
  },

  async deleteAppEvent(id) {
    if (!(await granted())) return denied;
    if (!(await isAppEvent(id))) return denied;
    try {
      await Calendar.deleteEventAsync(id);
      return ok(true as const);
    } catch {
      return failed;
    }
  },

  async disconnect() {
    try {
      const id = (await granted()) ? await storedAppCalendarId() : null;
      if (id) await Calendar.deleteCalendarAsync(id);
      await AsyncStorage.removeItem(APP_CALENDAR_KEY);
      return ok(true as const);
    } catch {
      return failed;
    }
  },
};
