import type { PlannedNotification } from '@/domain/notifications/engine';

/** Local scheduled notifications are not available in the web app (mobile only). */
export type PermissionResult = 'granted' | 'denied' | 'unsupported' | 'error';

export const notificationsSupported = false;

export async function requestNotificationPermission(): Promise<PermissionResult> {
  return 'unsupported';
}

export async function replaceScheduled(
  _plan: PlannedNotification[],
  _render: (n: PlannedNotification) => { title: string; body: string },
): Promise<number> {
  return 0;
}
