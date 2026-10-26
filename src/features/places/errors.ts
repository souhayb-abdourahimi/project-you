/**
 * One message per real cause, never naming a source the search may not have used (Geoapify or
 * OpenStreetMap, D-051): offline only when the device says so, the day's free quota, too many
 * requests, otherwise "temporarily unavailable". Permission and "nothing found" have their own.
 */
export function placesErrorKey(error: string): 'offline' | 'unavailable' | 'busy' | 'quota' {
  switch (error) {
    case 'offline':
      return 'offline';
    case 'quota':
      return 'quota';
    case 'rate_limited':
      return 'busy';
    default:
      return 'unavailable';
  }
}
