import { useState } from 'react';

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
  | { kind: 'location_error' }
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

  const search = async (kind = placeKind) => {
    setPhase({ kind: 'locating' });
    const position = await providers.location.current();
    if (position.status !== 'ok') {
      setPhase({
        kind:
          position.status === 'unavailable' && position.reason === 'permission_denied'
            ? 'location_denied'
            : 'location_error',
      });
      return;
    }
    setPhase({ kind: 'loading' });
    setPhase({ kind: 'done', result: await providers.places.nearby(kind, position.data, RADIUS[kind]) });
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

  const openMap = (place: Place) => providers.maps.open(place.location);

  return {
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
