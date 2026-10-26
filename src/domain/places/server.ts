/**
 * Places already shaped by the `places-nearby` function (Geoapify, D-051). An answer from the
 * network is never trusted as is: each place is checked, anything invalid is dropped, nothing is
 * filled in.
 */
import { z } from 'zod';

import { MAX_PLACES } from './osm';
import type { Place, PlaceKind } from './types';

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

const ServerPlace = z.object({
  id: z.string().min(1).max(220),
  name: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(80),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  address: nullableText(300),
  openingHours: nullableText(200),
  website: z
    .string()
    .max(300)
    .regex(/^https?:\/\//)
    .nullable(),
  distanceMeters: z.number().int().min(0).max(100_000),
});

/** `null`: not a list of places at all (an unusable answer, not "nothing around"). */
export function readServerPlaces(json: unknown, kind: PlaceKind): Place[] | null {
  const list = (json as { places?: unknown } | null)?.places;
  if (!Array.isArray(list)) return null;
  const places: Place[] = [];
  for (const raw of list) {
    const parsed = ServerPlace.safeParse(raw);
    if (parsed.success) places.push({ ...parsed.data, kind });
  }
  return places.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, MAX_PLACES);
}
