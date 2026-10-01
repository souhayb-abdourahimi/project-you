import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** AsyncStorage on native, localStorage on web. Data stays on the device until synced. */
export const persistStorage = createJSONStorage(() => AsyncStorage);
