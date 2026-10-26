/**
 * iCal feed → busy ranges (D-049), with ical.js (recurrences, exceptions, EXDATE, VTIMEZONE).
 * Only times leave this module: never a title, description, location, organiser or attendee.
 * - Cancelled events and events marked free (TRANSP:TRANSPARENT) are not busy.
 * - A time zone named but not defined in the feed (common with IANA names) is converted with the
 *   runtime's own zone database, so daylight saving changes are right; a floating time (no zone)
 *   is read in the user's zone, sent by the app.
 * - All-day events are kept as dates, marked `allDay` (the planner treats them like the device
 *   calendar's: it does not block a session on them, D-049).
 * - Timed ranges are merged when they overlap or touch; the output is bounded for large feeds.
 */
import ICAL from 'ical.js';

export interface BusyRange {
  /** ISO instant (UTC) for a timed range; `YYYY-MM-DD` for an all-day one. */
  start: string;
  /** Exclusive end, same format as `start`. */
  end: string;
  allDay: boolean;
}

export interface ParsedFeed {
  busy: BusyRange[];
  /** Occurrences found in the window (before merging). */
  eventCount: number;
  /** True when the feed had more than the limits allow: the first ones are kept. */
  truncated: boolean;
}

export interface ParseOptions {
  from: Date;
  to: Date;
  /** The user's IANA zone, for floating times. */
  timeZone: string;
  maxOccurrences?: number;
  maxRanges?: number;
}

/** Iterations per recurring event (most are skipped quickly before the window). */
const MAX_ITERATIONS = 20_000;

export function isIanaZone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Some producers prefix IANA names (`/freeassociation.sourceforge.net/Europe/Paris`). */
function ianaFrom(tzid: string | null | undefined): string | null {
  if (!tzid) return null;
  if (isIanaZone(tzid)) return tzid;
  const tail = tzid.split('/').slice(-2).join('/');
  return isIanaZone(tail) ? tail : null;
}

/** Offset (ms) of `zone` at instant `utcMs`. */
function offsetAt(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant of a wall-clock time in an IANA zone (two passes settle daylight saving edges). */
export function wallTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  zone: string,
): number {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  let guess = naive - offsetAt(naive, zone);
  guess = naive - offsetAt(guess, zone);
  return guess;
}

function instant(time: ICAL.Time, tzid: string | null, userZone: string): number {
  const zone = time.zone;
  const defined = zone && zone !== ICAL.Timezone.localTimezone && zone.tzid !== 'floating';
  if (defined) return time.toUnixTime() * 1000;
  return wallTimeToUtc(time, ianaFrom(tzid) ?? userZone);
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

function isBusy(component: ICAL.Component): boolean {
  const status = String(component.getFirstPropertyValue('status') ?? '').toUpperCase();
  const transp = String(component.getFirstPropertyValue('transp') ?? '').toUpperCase();
  return status !== 'CANCELLED' && transp !== 'TRANSPARENT';
}

const tzidOf = (component: ICAL.Component) =>
  (component.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? null;

export function parseBusy(text: string, options: ParseOptions): ParsedFeed {
  const maxOccurrences = options.maxOccurrences ?? 5_000;
  const maxRanges = options.maxRanges ?? 3_000;
  const userZone = isIanaZone(options.timeZone) ? options.timeZone : 'UTC';
  const fromMs = options.from.getTime();
  const toMs = options.to.getTime();
  const fromDate = options.from.toISOString().slice(0, 10);
  const toDate = options.to.toISOString().slice(0, 10);

  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('not a calendar');
  // Zones defined by this feed only (the service is global to the runtime: start clean).
  ICAL.TimezoneService.reset();
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      // An unusable definition: its times fall back to the IANA name or the user's zone.
    }
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Component[] = [];
  const singles: ICAL.Event[] = [];
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate) continue;
    if (vevent.hasProperty('recurrence-id')) exceptions.push(vevent);
    else if (event.uid && event.isRecurring()) masters.set(event.uid, event);
    else singles.push(event);
  }
  for (const vevent of exceptions) {
    const master = masters.get(String(vevent.getFirstPropertyValue('uid') ?? ''));
    // An exception whose series is missing is an event of its own.
    if (master) master.relateException(vevent);
    else singles.push(new ICAL.Event(vevent));
  }

  const timed: { start: number; end: number }[] = [];
  const allDay = new Set<string>();
  let count = 0;
  let truncated = false;

  const add = (start: ICAL.Time, end: ICAL.Time | null, component: ICAL.Component) => {
    if (!isBusy(component)) return;
    if (start.isDate) {
      const last = end && end.compare(start) > 0 ? end : start.clone();
      if (!end || end.compare(start) <= 0) last.adjust(1, 0, 0, 0);
      const s = dateOf(start);
      const e = dateOf(last);
      if (e <= fromDate || s > toDate) return;
      count++;
      allDay.add(`${s}|${e}`);
      return;
    }
    const tzid = tzidOf(component);
    const s = instant(start, tzid, userZone);
    const e = end
      ? instant(end, (component.getFirstProperty('dtend')?.getParameter('tzid') as string) ?? tzid, userZone)
      : s;
    if (e <= s || e <= fromMs || s >= toMs) return; // zero length or outside the window
    count++;
    timed.push({ start: Math.max(s, fromMs), end: Math.min(e, toMs) });
  };

  for (const event of singles) {
    if (count >= maxOccurrences) {
      truncated = true;
      break;
    }
    add(event.startDate, event.endDate, event.component);
  }
  for (const event of masters.values()) {
    if (!isBusy(event.component)) continue;
    const iterator = event.iterator();
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const next = iterator.next();
      if (!next) break;
      const details = event.getOccurrenceDetails(next);
      const startMs = details.startDate.isDate
        ? Date.parse(`${dateOf(details.startDate)}T00:00:00Z`)
        : instant(details.startDate, tzidOf(details.item.component), userZone);
      if (startMs >= toMs + 86_400_000) break; // past the window (a day of margin for zones)
      if (count >= maxOccurrences) {
        truncated = true;
        break;
      }
      add(details.startDate, details.endDate, details.item.component);
    }
  }

  // Merge overlapping or touching timed ranges: fewer, coarser ranges (only "busy" matters).
  timed.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of timed) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const busy: BusyRange[] = [
    ...merged.map((r) => ({
      start: new Date(r.start).toISOString(),
      end: new Date(r.end).toISOString(),
      allDay: false,
    })),
    ...[...allDay].sort().map((k) => {
      const [start, end] = k.split('|');
      return { start, end, allDay: true };
    }),
  ];
  if (busy.length > maxRanges) truncated = true;
  return { busy: busy.slice(0, maxRanges), eventCount: count, truncated };
}
