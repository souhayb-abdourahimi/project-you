import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { PlaceKind } from '@/domain/places/types';
import { UserContextSnapshot } from '@/domain/profile/schemas';
import { providers } from '@/providers';
import type { Place, ProviderResult } from '@/providers/types';
import { useProfileStore } from '@/state/profile';

const RADIUS: Record<PlaceKind, number> = { gym: 5000, store: 2000 };

type Phase =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'loading' }
  | { kind: 'location_denied' }
  | { kind: 'location_error'; reason: 'timeout' | 'unknown' }
  | { kind: 'done'; result: ProviderResult<Place[]> };

/**
 * Nearby gyms or food stores. The position is asked for only when the user taps search, used
 * once, and never kept.
 */
export function usePlaces() {
  const [placeKind, setPlaceKind] = useState<PlaceKind>('gym');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const snapshot = useProfileStore((s) => s.snapshot);
  const setSnapshot = useProfileStore((s) => s.setSnapshot);

  // Only the latest search may change the screen (switching kind mid-search, leaving the screen).
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current += 1;
    },
    [],
  );

  const search = async (kind = placeKind) => {
    const id = ++latest.current;
    const show = (next: Phase) => {
      if (latest.current === id) setPhase(next);
    };
    show({ kind: 'locating' });
    const position = await providers.location.current();
    if (position.status !== 'ok') {
      show(
        position.status === 'unavailable' && position.reason === 'permission_denied'
          ? { kind: 'location_denied' }
          : {
              kind: 'location_error',
              reason: position.status === 'error' && position.error === 'timeout' ? 'timeout' : 'unknown',
            },
      );
      return;
    }
    show({ kind: 'loading' });
    const result = await providers.places.nearby(kind, position.data, RADIUS[kind]);
    show({ kind: 'done', result });
  };

  const switchKind = (kind: PlaceKind) => {
    setPlaceKind(kind);
    if (phase.kind === 'done') void search(kind);
  };

  /** Records the user's choice; equipment is not guessed from the place (it stays the user's answer). */
  const chooseGym = (place: Place) => {
    if (!snapshot) return;
    const next = UserContextSnapshot.safeParse({
      ...snapshot,
      training: { ...snapshot.training, hasGym: true, gymName: place.name.slice(0, 80) },
    });
    if (next.success) setSnapshot(next.data);
  };

  const openMap = (place: Place) => providers.maps.open(place.location, place.name);

  return {
    radiusKm: RADIUS[placeKind] / 1000,
    /** In a browser the permission lives in the browser / iPhone settings, not in the app's. */
    deniedMessage: Platform.OS === 'web' ? 'places.locationDeniedWeb' : 'places.locationDenied',
    busy: phase.kind === 'locating' || phase.kind === 'loading',
    placeKind,
    phase,
    currentGym: snapshot?.training.hasGym ? (snapshot.training.gymName ?? null) : null,
    hadNoGym: snapshot ? !snapshot.training.hasGym : false,
    search,
    switchKind,
    chooseGym,
    openMap,
  };
}
