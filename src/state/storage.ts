import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Whether the last write to the device succeeded. A failed write (storage full, private mode) is
 * shown as a simple message; the session stays in memory and the next write retries (W-3, D-034).
 */
export const useStorageHealth = create<{ saveFailed: boolean }>()(() => ({ saveFailed: false }));

const safe: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
      if (useStorageHealth.getState().saveFailed) useStorageHealth.setState({ saveFailed: false });
    } catch {
      useStorageHealth.setState({ saveFailed: true });
    }
  },
  removeItem: (name) => AsyncStorage.removeItem(name),
};

/** AsyncStorage on native, localStorage on web. Data stays on the device until synced. */
export const persistStorage = createJSONStorage(() => safe);
