import { replaceScheduled } from '@/services/notifications';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';

/**
 * Clears everything personal kept on this device: data, profile, reminder preferences and the
 * reminders already scheduled (their text can include the user's own motivation).
 * Used on sign-out, on account switch and by "reset local data".
 */
export function resetDeviceData(): Promise<void> {
  useDataStore.getState().reset();
  useProfileStore.getState().reset();
  useNotificationStore.getState().reset();
  return replaceScheduled([], () => ({ title: '', body: '' })).then(
    () => undefined,
    () => undefined,
  );
}
