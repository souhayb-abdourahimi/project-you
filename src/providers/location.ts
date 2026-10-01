import * as Location from 'expo-location';

import { isValidPoint } from '@/domain/places/osm';

import type { LocationProvider } from './types';

/**
 * Foreground position, read once on request. Never stored, synced or logged: it only feeds the
 * nearby search, which rounds it before sending (src/domain/places/osm.ts).
 */
export const deviceLocationProvider: LocationProvider = {
  async current() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return { status: 'unavailable', reason: 'permission_denied' };
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
