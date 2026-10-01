import type { HealthProvider, ProviderResult } from './types';

const unsupported = { status: 'unavailable', reason: 'not_supported_on_platform' } as const;
const none = async <T>(): Promise<ProviderResult<T>> => unsupported;

/**
 * Web (and any platform without a health store): Apple Health and Health Connect only exist in the
 * native apps. Manual entry stays available everywhere.
 */
export const deviceHealthProvider: HealthProvider = {
  source: null,
  getAvailability: async () => 'not_supported',
  requestPermissions: none,
  getPermissions: none,
  getWeight: none,
  getSteps: none,
  getWorkouts: none,
  getActiveCalories: none,
  disconnect: async () => ({ status: 'unavailable', reason: 'not_supported_on_platform' }),
  openSettings: async () => {},
};
