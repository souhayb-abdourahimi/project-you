import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

export type LanguageChoice = 'system' | 'fr' | 'en';

interface DeviceSettingsState {
  /**
   * Screen language of this device (D-043): the system's by default, or the user's choice. A device
   * setting, not an account one: two devices may read the app in two languages.
   */
  language: LanguageChoice;
  setLanguage: (language: LanguageChoice) => void;
}

/** Settings of this device only (never synced, kept on sign-out: nothing personal in them). */
export const useDeviceSettings = create<DeviceSettingsState>()(
  persist(
    (set) => ({
      language: 'system',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'py.device.v1', storage: persistStorage, version: 1 },
  ),
);
