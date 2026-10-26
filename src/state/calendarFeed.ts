import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CalendarBusyEvent } from '@/domain/calendar/calendar';

import { persistStorage } from './storage';

/** Why the last test, save or refresh of the iCal link failed (D-049). */
export type CalendarFeedIssue =
  | 'invalid_url'
  | 'not_https'
  | 'blocked_address'
  | 'timeout'
  | 'access_denied'
  | 'not_found'
  | 'not_ics'
  | 'too_large'
  | 'unavailable'
  | 'not_configured'
  | 'not_deployed'
  | 'too_many_requests'
  | 'auth'
  | 'offline';

export interface CalendarFeedLink {
  /** Host of the linked calendar (the link itself stays sealed on the server). */
  host: string;
  enabled: boolean;
  /** Busy ranges only (ISO instants, or dates when all-day): never a title or a detail. */
  busy: CalendarBusyEvent[];
  eventCount: number;
  syncedAt: string | null;
  /** Last refresh problem; the busy times above are the last good ones. */
  issue: CalendarFeedIssue | null;
}

interface CalendarFeedState {
  link: CalendarFeedLink | null;
  set: (link: CalendarFeedLink | null) => void;
  patch: (patch: Partial<CalendarFeedLink>) => void;
  reset: () => void;
}

/**
 * The iCal link as last read from the account (calendar_feeds), kept on the device so planning
 * works offline. The server row is the source of truth; this is its cache.
 */
export const useCalendarFeedStore = create<CalendarFeedState>()(
  persist(
    (set) => ({
      link: null,
      set: (link) => set({ link }),
      patch: (patch) => set((s) => (s.link ? { link: { ...s.link, ...patch } } : s)),
      reset: () => set({ link: null }),
    }),
    { name: 'py.calendarFeed.v1', storage: persistStorage, version: 1 },
  ),
);
