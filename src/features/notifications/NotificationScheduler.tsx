import { useNotificationScheduler } from '@/hooks/useNotificationScheduler';
import { usePlan } from '@/hooks/usePlan';

/** Invisible: keeps the device's reminders in line with the plan. */
export function NotificationScheduler() {
  useNotificationScheduler(usePlan());
  return null;
}
