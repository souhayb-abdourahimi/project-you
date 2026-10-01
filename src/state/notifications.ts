import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { markOpened } from '@/domain/notifications/history';
import type { CheckinSignal } from '@/domain/journey/state';
import type { VoiceUse } from '@/domain/journey/voice/types';
import { addDays } from '@/domain/shared/dates';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationHistoryEntry,
  type NotificationPreferences,
} from '@/domain/notifications/types';

import { persistStorage } from './storage';

interface NotificationState {
  prefs: NotificationPreferences;
  /** Last permission answer, so the screen can explain a refusal. */
  permission: 'unknown' | 'granted' | 'denied' | 'unsupported' | 'error';
  /** Messages this device scheduled (template ids only, never the text). */
  history: NotificationHistoryEntry[];
  /**
   * Check-ins saved before D-028, waiting to be moved into the journey's day logs (synced).
   * Emptied by `moveLegacyCheckins`; nothing writes here any more.
   */
  checkins: CheckinSignal[];
  /** What the Today screen said (template ids only, 90 days): one voice history with the notifications. */
  screenVoice: VoiceUse[];
  update: (patch: Partial<NotificationPreferences>) => void;
  toggleCategory: (category: NotificationCategory) => void;
  setPermission: (permission: NotificationState['permission']) => void;
  setHistory: (history: NotificationHistoryEntry[]) => void;
  markOpened: (id: string) => void;
  clearLegacyCheckins: () => void;
  /** Records the coach message the Today screen showed today (once per day). */
  recordScreen: (use: VoiceUse) => void;
  reset: () => void;
}

/** How long the screen's voice history is kept (template ids only). */
const SCREEN_VOICE_DAYS = 90;

/** Device-level preferences (reminders are scheduled per device, so they are not synced yet, D-024). */
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_NOTIFICATION_PREFERENCES,
      permission: 'unknown',
      history: [],
      checkins: [],
      screenVoice: [],
      update: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      toggleCategory: (category) =>
        set((s) => ({
          prefs: { ...s.prefs, categories: { ...s.prefs.categories, [category]: !s.prefs.categories[category] } },
        })),
      setPermission: (permission) => set({ permission }),
      setHistory: (history) => set({ history }),
      markOpened: (id) => set((s) => ({ history: markOpened(s.history, id, new Date().toISOString()) })),
      clearLegacyCheckins: () => set({ checkins: [] }),
      recordScreen: (use) =>
        set((s) => {
          if (s.screenVoice.some((u) => u.date === use.date && u.templateId === use.templateId)) return {};
          const from = addDays(use.date, -SCREEN_VOICE_DAYS);
          return {
            screenVoice: [
              ...s.screenVoice.filter((u) => u.date !== use.date && u.date >= from),
              { ...use, channel: 'screen' as const },
            ],
          };
        }),
      reset: () =>
        set({
          prefs: DEFAULT_NOTIFICATION_PREFERENCES,
          permission: 'unknown',
          history: [],
          checkins: [],
          screenVoice: [],
        }),
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
