import { isValidPoint } from '@/domain/places/osm';
import type { GeoPoint } from '@/domain/places/types';

import type { LocationProvider, ProviderResult } from './types';

/** Time for a fix once the permission is given (the browser's own timeout). */
export const POSITION_TIMEOUT_MS = 15_000;
/** Also covers a permission prompt left unanswered: the search never stays on "Locating…". */
export const PROMPT_GUARD_MS = 45_000;
/** A position from the last few minutes is good enough for a 2-5 km search, and much faster. */
const MAX_AGE_MS = 5 * 60_000;

/** GeolocationPositionError codes (the constants are not on the error object in every browser). */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

/**
 * Browser position (Safari, the installed web app, Chrome), read once on request with one prompt
 * and one fix. Each browser error gets its own outcome so the screen can say what happened.
 * Never stored, synced or logged; the nearby search rounds it before sending.
 */
export const deviceLocationProvider: LocationProvider = {
  current() {
    return new Promise<ProviderResult<GeoPoint>>((resolve) => {
      const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
      if (!geolocation) {
        resolve({ status: 'unavailable', reason: 'not_supported_on_platform' });
        return;
      }
      let settled = false;
      const done = (result: ProviderResult<GeoPoint>) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(result);
      };
      const guard = setTimeout(() => done({ status: 'error', error: 'timeout', retryable: true }), PROMPT_GUARD_MS);
      geolocation.getCurrentPosition(
        (position) => {
          const point = { lat: position.coords.latitude, lng: position.coords.longitude };
          if (!isValidPoint(point)) {
            done({ status: 'unavailable', reason: 'no_data' });
            return;
          }
          done({
            status: 'ok',
            data: point,
            meta: {
              provider: 'device-location',
              externalId: null,
              source: 'Position du navigateur',
              fetchedAt: new Date().toISOString(),
              updatedAt: null,
              confidence: 'high',
              isMock: false,
            },
          });
        },
        (error) => {
          if (error.code === PERMISSION_DENIED) done({ status: 'unavailable', reason: 'permission_denied' });
          else if (error.code === TIMEOUT) done({ status: 'error', error: 'timeout', retryable: true });
          else done({ status: 'error', error: 'unknown', retryable: true });
        },
        { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: MAX_AGE_MS },
      );
    });
  },
};
