/**
 * Provider-neutral place types. The UI and the recommendation logic only know these, so the data
 * source (OpenStreetMap today, a self-hosted or commercial service later, D-019) can change
 * without touching them.
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export type PlaceKind = 'gym' | 'store';

export interface Place {
  /** Provider-scoped id (e.g. `osm:node/123`). */
  id: string;
  kind: PlaceKind;
  name: string;
  /** Category as given by the provider, shown as is. */
  category: string;
  location: GeoPoint;
  address: string | null;
  /** Opening hours exactly as the source has them; never interpreted as "open now". */
  openingHours: string | null;
  website: string | null;
  /** Straight-line distance from the (rounded) search point; not a travel time. */
  distanceMeters: number;
}
