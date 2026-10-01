import { useCalendarSync } from '@/hooks/useCalendarSync';
import { usePlan } from '@/hooks/usePlan';

/** Invisible: reads busy times and keeps the app's calendar events in line with the plan. */
export function CalendarSync() {
  useCalendarSync(usePlan());
  return null;
}
