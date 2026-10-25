import * as Location from 'expo-location';

import { isValidPoint } from '@/domain/places/osm';

import type { LocationProvider } from './types';

/** A position that never comes (no GPS fix, a desktop browser) must not leave "Locating…" forever. */
const POSITION_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), ms);
    }),
  ]);
}

/**
 * Foreground position, read once on request. Never stored, synced or logged: it only feeds the
 * nearby search, which rounds it before sending (src/domain/places/osm.ts).
 */
export const deviceLocationProvider: LocationProvider = {
  async current() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return { status: 'unavailable', reason: 'permission_denied' };
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        POSITION_TIMEOUT_MS,
      );
      if (position === 'timeout') return { status: 'error', error: 'timeout', retryable: true };
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (!isValidPoint(point)) return { status: 'unavailable', reason: 'no_data' };
      return {
        status: 'ok',
        data: point,
        meta: {
          provider: 'device-location',
          externalId: null,
          source: 'GPS / réseau de l’appareil',
          fetchedAt: new Date().toISOString(),
          updatedAt: null,
          confidence: 'high',
          isMock: false,
        },
      };
    } catch {
      return { status: 'error', error: 'unknown', retryable: true };
    }
  },
};
