import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedNotification } from '@/domain/notifications/engine';

const CHANNEL = 'reminders';
const APP_TAG = 'project-you';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PermissionResult = 'granted' | 'denied' | 'unsupported' | 'error';

export const notificationsSupported = true;

/** Asked only when the user turns reminders on (docs/PRIVACY.md). */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Rappels',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    return status.granted ? 'granted' : 'denied';
  } catch {
    return 'error';
  }
}

/** Replaces every reminder this app scheduled with the new plan. Never touches other apps' data. */
export async function replaceScheduled(
  plan: PlannedNotification[],
  render: (n: PlannedNotification) => { title: string; body: string },
): Promise<number> {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((r) => r.content.data?.tag === APP_TAG)
      .map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier)),
  );
  let count = 0;
  for (const n of plan) {
    const [y, m, d] = n.date.split('-').map(Number);
    const [hh, mm] = n.time.split(':').map(Number);
    const date = new Date(y, m - 1, d, hh, mm);
    if (date.getTime() <= Date.now()) continue;
    const { title, body } = render(n);
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title, body, data: { tag: APP_TAG, category: n.category } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
    });
    count += 1;
  }
  return count;
}
