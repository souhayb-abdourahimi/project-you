import { useJourneyState } from '@/hooks/useJourneyState';
import { useNotificationScheduler } from '@/hooks/useNotificationScheduler';
import { usePlan } from '@/hooks/usePlan';

/** Invisible: keeps the device's reminders in line with the journey state and the plan. */
export function NotificationScheduler() {
  const plan = usePlan();
  useNotificationScheduler(plan, useJourneyState(plan));
  return null;
}
