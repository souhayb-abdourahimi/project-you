import { providers } from '@/providers';
import { replaceScheduled } from '@/services/notifications';
import { useCalendarStore } from '@/state/calendar';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';

/**
 * Clears everything personal kept on this device: data, profile, reminder preferences, the
 * reminders already scheduled (their text can include the user's own motivation) and the
 * calendar link with the app's own calendar.
 * Used on sign-out, on account switch and by "reset local data".
 */
export function resetDeviceData(): Promise<void> {
  useDataStore.getState().reset();
  useProfileStore.getState().reset();
  useNotificationStore.getState().reset();
  const calendarLinked = useCalendarStore.getState().connected;
  useCalendarStore.getState().reset();
  return Promise.all([
    replaceScheduled([], () => ({ title: '', body: '' })),
    // The "Project You" calendar holds this person's sessions: removed with the rest.
    calendarLinked ? providers.calendar.disconnect() : null,
  ]).then(
    () => undefined,
    () => undefined,
  );
}
