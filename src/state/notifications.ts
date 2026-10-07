import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { markOpened } from '@/domain/notifications/history';
import type { CheckinSignal } from '@/domain/journey/state';
import type { VoiceUse } from '@/domain/journey/voice/types';
import { addDays, type IsoDate } from '@/domain/shared/dates';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizePreferences,
  type NotificationCategory,
  type NotificationHistoryEntry,
  type NotificationPreferences,
} from '@/domain/notifications/types';

import { persistStorage } from './storage';

interface NotificationState {
  prefs: NotificationPreferences;
  /**
   * The preferences are the user's (changed here, or the account's copy pulled): only then are they
   * synced (W-8, D-043). Untouched defaults are never pushed over the account's choices.
   */
  prefsSaved: boolean;
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
  /**
   * Coach lines the Today screen showed (ids only, never text, 90 days): a question or a follow-up
   * is not repeated day after day (W-7 §28). Device-level; answers live in the synced journal.
   */
  coachShown: { id: string; date: IsoDate }[];
  update: (patch: Partial<NotificationPreferences>) => void;
  toggleCategory: (category: NotificationCategory) => void;
  /** The account's preferences arrived (sync): adopted as they are. */
  adoptPrefs: (prefs: NotificationPreferences) => void;
  setPermission: (permission: NotificationState['permission']) => void;
  setHistory: (history: NotificationHistoryEntry[]) => void;
  markOpened: (id: string) => void;
  clearLegacyCheckins: () => void;
  /** Records the coach message the Today screen showed today (once per day). */
  recordScreen: (use: VoiceUse) => void;
  /** Records the coach lines shown today (once per id and day). */
  recordCoach: (ids: string[], date: IsoDate) => void;
  reset: () => void;
}

/** Defaults before W-8: preferences still equal to them were never changed by the user. */
const V2_DEFAULTS = (() => {
  const { quietEnabled: _q, categories, ...rest } = DEFAULT_NOTIFICATION_PREFERENCES;
  const { checkin: _c, milestones: _m, ...kept } = categories;
  return { ...rest, categories: { ...kept, calendar: false } };
})();

/** JSON with sorted keys: two objects with the same content compare equal whatever their key order. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );

/** How long the screen's voice history is kept (template ids only). */
const SCREEN_VOICE_DAYS = 90;

/**
 * Reminder preferences (synced with the account since W-8, `notification_settings`), plus what stays
 * on this device: the permission answer, the scheduled history, what the screen said.
 */
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_NOTIFICATION_PREFERENCES,
      prefsSaved: false,
      permission: 'unknown',
      history: [],
      checkins: [],
      screenVoice: [],
      coachShown: [],
      update: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch }, prefsSaved: true })),
      toggleCategory: (category) =>
        set((s) => ({
          prefs: { ...s.prefs, categories: { ...s.prefs.categories, [category]: !s.prefs.categories[category] } },
          prefsSaved: true,
        })),
      adoptPrefs: (prefs) => set({ prefs, prefsSaved: true }),
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
      recordCoach: (ids, date) =>
        set((s) => {
          const added = ids.filter((id) => !s.coachShown.some((u) => u.id === id && u.date === date));
          if (added.length === 0) return {};
          const from = addDays(date, -SCREEN_VOICE_DAYS);
          return {
            coachShown: [...s.coachShown.filter((u) => u.date >= from), ...added.map((id) => ({ id, date }))],
          };
        }),
      reset: () =>
        set({
          prefs: DEFAULT_NOTIFICATION_PREFERENCES,
          prefsSaved: false,
          permission: 'unknown',
          history: [],
          checkins: [],
          screenVoice: [],
          coachShown: [],
        }),
    }),
    {
      name: 'py.notifications.v1',
      storage: persistStorage,
      version: 3,
      // v1 → v2: new coach preferences get their defaults; existing choices are kept.
      // v2 → v3 (W-8): `checkin` and `milestones` split from `progress` (same value), `calendar`
      // (no trigger) dropped, quiet hours switch on; preferences changed by the user become synced.
      migrate: (persisted, version) => {
        let state = (persisted ?? {}) as Partial<NotificationState>;
        if (version < 2) {
          state = {
            ...state,
            prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...state.prefs },
            history: [],
            checkins: [],
          };
        }
        if (version < 3) {
          const changed = stable(state.prefs ?? null) !== stable(V2_DEFAULTS);
          state = { ...state, prefs: normalizePreferences(state.prefs ?? {}), prefsSaved: !!state.prefs && changed };
        }
        return state as NotificationState;
      },
    },
  ),
);
