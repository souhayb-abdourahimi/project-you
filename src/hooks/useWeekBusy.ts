import { useMemo } from 'react';

import { busyFromEvents, type BusySlot } from '@/domain/calendar/calendar';
import type { IsoDate } from '@/domain/shared/dates';
import { useCalendarStore } from '@/state/calendar';
import { useCalendarFeedStore } from '@/state/calendarFeed';

/**
 * Busy slots of a week that constrain session placement: the device calendar (native, read for the
 * current week) and the iCal link (D-049, any week it covers). Both are only times; manual
 * availability stays the frame (sessions are placed inside it, outside these slots).
 */
export function useWeekBusy(weekStart: IsoDate): BusySlot[] {
  const device = useCalendarStore((s) => (s.connected && s.readBusy ? s.busy : null));
  const feed = useCalendarFeedStore((s) => (s.link?.enabled ? s.link.busy : null));
  return useMemo(
    () =>
      !weekStart
        ? []
        : [
            ...(device?.weekStart === weekStart ? device.slots : []),
            // Converted on the device: its local time zone is the user's.
            ...(feed ? busyFromEvents(feed, weekStart) : []),
          ],
    [device, feed, weekStart],
  );
}

/**
 * The calendar the planner reads this week (D-050): its busy times when a calendar is active (the
 * device calendar read, or an enabled iCal link), null otherwise. Active with no busy time this
 * week still counts: the free week is then real, and sessions get real times.
 */
export function useWeekCalendar(weekStart: IsoDate): { busy: BusySlot[] } | null {
  const busy = useWeekBusy(weekStart);
  const device = useCalendarStore((s) => s.connected && s.readBusy);
  const feed = useCalendarFeedStore((s) => !!s.link?.enabled);
  const active = device || feed;
  return useMemo(() => (active ? { busy } : null), [active, busy]);
}
