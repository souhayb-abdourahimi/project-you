import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/domain/notifications/engine';

import { persistStorage } from './storage';

interface NotificationState {
  prefs: NotificationPreferences;
  /** Last permission answer, so the screen can explain a refusal. */
  permission: 'unknown' | 'granted' | 'denied' | 'unsupported' | 'error';
  update: (patch: Partial<NotificationPreferences>) => void;
  toggleCategory: (category: NotificationCategory) => void;
  setPermission: (permission: NotificationState['permission']) => void;
  reset: () => void;
}

/** Device-level preferences (reminders are scheduled per device, so they are not synced). */
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_NOTIFICATION_PREFERENCES,
      permission: 'unknown',
      update: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      toggleCategory: (category) =>
        set((s) => ({
          prefs: { ...s.prefs, categories: { ...s.prefs.categories, [category]: !s.prefs.categories[category] } },
        })),
      setPermission: (permission) => set({ permission }),
      reset: () => set({ prefs: DEFAULT_NOTIFICATION_PREFERENCES, permission: 'unknown' }),
    }),
    { name: 'py.notifications.v1', storage: persistStorage, version: 1 },
  ),
);
