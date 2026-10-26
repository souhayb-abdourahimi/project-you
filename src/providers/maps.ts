import { Linking, Platform } from 'react-native';

import type { GeoPoint, MapsProvider } from './types';

/**
 * "Voir sur la carte" without any key or billed service (D-051): the phone's own maps app when
 * there is one (Apple Maps on iPhone, the default maps app through a geo: link on Android), else
 * openstreetmap.org. Only the place's position and name are passed, never the user's.
 */
export type MapTarget = { url: string; provider: 'apple-maps' | 'geo-uri' | 'openstreetmap' };

const osm = (at: GeoPoint): MapTarget => ({
  url: `https://www.openstreetmap.org/?mlat=${at.lat}&mlon=${at.lng}#map=18/${at.lat}/${at.lng}`,
  provider: 'openstreetmap',
});

/** Links to try in order; the last one always works in a browser. */
export function mapTargets(at: GeoPoint, label: string | null, platform: string, iosBrowser: boolean): MapTarget[] {
  const q = label ? encodeURIComponent(label) : null;
  const apple = (scheme: string): MapTarget => ({
    url: `${scheme}?ll=${at.lat},${at.lng}${q ? `&q=${q}` : ''}`,
    provider: 'apple-maps',
  });
  if (platform === 'ios') return [apple('maps://'), apple('https://maps.apple.com/'), osm(at)];
  if (platform === 'android')
    return [{ url: `geo:${at.lat},${at.lng}?q=${at.lat},${at.lng}${q ? `(${q})` : ''}`, provider: 'geo-uri' }, osm(at)];
  // Web: on an iPhone or iPad, maps.apple.com opens the Plans app; elsewhere OpenStreetMap.
  return iosBrowser ? [apple('https://maps.apple.com/'), osm(at)] : [osm(at)];
}

/** iPhone / iPad Safari, including the home-screen app (iPadOS reports itself as a Mac with touch). */
export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

export const deviceMapsProvider: MapsProvider = {
  open: async (at, label) => {
    const targets = mapTargets(at, label ?? null, Platform.OS, Platform.OS === 'web' && isIosBrowser());
    for (const [i, target] of targets.entries()) {
      try {
        // Opening fails (rejects) when no app takes the link: the next one is tried. No canOpenURL:
        // it needs the schemes declared in the native config and says "no" otherwise.
        await Linking.openURL(target.url);
        return {
          status: 'ok',
          data: true,
          meta: {
            provider: target.provider,
            externalId: null,
            source: target.provider === 'openstreetmap' ? 'openstreetmap.org' : target.provider,
            fetchedAt: new Date().toISOString(),
            updatedAt: null,
            confidence: 'medium',
            isMock: false,
          },
        };
      } catch {
        if (i === targets.length - 1) break;
      }
    }
    return { status: 'error', error: 'unknown', retryable: false };
  },
};
