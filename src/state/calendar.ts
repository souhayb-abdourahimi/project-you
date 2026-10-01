import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BusySlot, WrittenEvents } from '@/domain/calendar/calendar';
import type { IsoDate } from '@/domain/shared/dates';

import { persistStorage } from './storage';

interface CalendarState {
  connected: boolean;
  /** Use busy times from the user's calendars when placing sessions. */
  readBusy: boolean;
  /** Write upcoming sessions in the "Project You" calendar. */
  writeSessions: boolean;
  /** Last busy times read for a week: time ranges only, kept on this device, never synced. */
  busy: { weekStart: IsoDate; slots: BusySlot[]; readAt: string } | null;
  written: WrittenEvents;
  status: 'idle' | 'denied' | 'unsupported' | 'error';
  connect: () => void;
  update: (patch: Partial<Pick<CalendarState, 'readBusy' | 'writeSessions' | 'busy' | 'written' | 'status'>>) => void;
  reset: () => void;
}

const initial = {
  connected: false,
  readBusy: true,
  writeSessions: true,
  busy: null,
  written: {},
  status: 'idle' as const,
};

/** Device-level calendar link (each device has its own calendars), not synced to the account. */
export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      ...initial,
      connect: () => set({ connected: true, status: 'idle' }),
      update: (patch) => set(patch),
      reset: () => set(initial),
    }),
    { name: 'py.calendar.v1', storage: persistStorage, version: 1 },
  ),
);
