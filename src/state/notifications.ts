import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { markOpened } from '@/domain/notifications/history';
import type { CheckinSignal } from '@/domain/journey/state';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationHistoryEntry,
  type NotificationPreferences,
} from '@/domain/notifications/types';

import { persistStorage } from './storage';

/** Check-ins kept on the device for the coach signals (fatigue of the day). */
const MAX_CHECKINS = 30;

interface NotificationState {
  prefs: NotificationPreferences;
  /** Last permission answer, so the screen can explain a refusal. */
  permission: 'unknown' | 'granted' | 'denied' | 'unsupported' | 'error';
  /** Messages this device scheduled (template ids only, never the text). */
  history: NotificationHistoryEntry[];
  checkins: CheckinSignal[];
  update: (patch: Partial<NotificationPreferences>) => void;
  toggleCategory: (category: NotificationCategory) => void;
  setPermission: (permission: NotificationState['permission']) => void;
  setHistory: (history: NotificationHistoryEntry[]) => void;
  markOpened: (id: string) => void;
  logCheckin: (checkin: CheckinSignal) => void;
  reset: () => void;
}

/** Device-level preferences (reminders are scheduled per device, so they are not synced yet, D-024). */
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_NOTIFICATION_PREFERENCES,
      permission: 'unknown',
      history: [],
      checkins: [],
      update: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      toggleCategory: (category) =>
        set((s) => ({
          prefs: { ...s.prefs, categories: { ...s.prefs.categories, [category]: !s.prefs.categories[category] } },
        })),
      setPermission: (permission) => set({ permission }),
      setHistory: (history) => set({ history }),
      markOpened: (id) => set((s) => ({ history: markOpened(s.history, id, new Date().toISOString()) })),
      logCheckin: (checkin) =>
        set((s) => ({
          checkins: [...s.checkins.filter((c) => c.date !== checkin.date), checkin]
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-MAX_CHECKINS),
        })),
      reset: () => set({ prefs: DEFAULT_NOTIFICATION_PREFERENCES, permission: 'unknown', history: [], checkins: [] }),
    }),
    {
      name: 'py.notifications.v1',
      storage: persistStorage,
      version: 2,
      // v1 → v2: new coach preferences get their defaults; existing choices are kept.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<NotificationState>;
        if (version < 2) {
          return {
            ...state,
            prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...state.prefs },
            history: [],
            checkins: [],
          } as NotificationState;
        }
        return state as NotificationState;
      },
    },
  ),
);
