/**
 * iCal → busy ranges (D-049): recurrences, exceptions, time zones and daylight saving, all-day,
 * cancelled and free events, overlaps, large feeds. Nothing but times comes out.
 */
import { parseBusy, wallTimeToUtc } from '../ics';

const cal = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join('\r\n');
const event = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const window = {
  from: new Date('2026-10-19T00:00:00Z'),
  to: new Date('2026-11-30T00:00:00Z'),
  timeZone: 'Europe/Paris',
};

const PARIS_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

describe('parseBusy', () => {
  it('a UTC event becomes one busy range; no title, place or person comes out', () => {
    const r = parseBusy(
      cal(
        ...event(
          'UID:1',
          'DTSTART:20261020T080000Z',
          'DTEND:20261020T100000Z',
          'SUMMARY:Rendez-vous médical confidentiel',
          'LOCATION:12 rue Secrète',
          'DESCRIPTION:Notes privées',
          'ORGANIZER:mailto:boss@example.com',
          'ATTENDEE:mailto:ami@example.com',
        ),
      ),
      window,
    );
    expect(r).toEqual({
      busy: [{ start: '2026-10-20T08:00:00.000Z', end: '2026-10-20T10:00:00.000Z', allDay: false }],
      eventCount: 1,
      truncated: false,
    });
    expect(JSON.stringify(r)).not.toMatch(/médical|Secrète|privées|boss|ami@/);
  });

  it('a weekly class in Europe/Paris keeps 08:00 local across the end of daylight saving (VTIMEZONE)', () => {
    const r = parseBusy(
      cal(
        ...PARIS_VTIMEZONE,
        ...event(
          'UID:cours',
          'DTSTART;TZID=Europe/Paris:20261019T080000',
          'DTEND;TZID=Europe/Paris:20261019T100000',
          'RRULE:FREQ=WEEKLY;COUNT=2',
        ),
      ),
      window,
    );
    // 19 Oct: CEST (UTC+2) → 06:00Z. 26 Oct: CET (UTC+1) → 07:00Z.
    expect(r.busy.map((b) => b.start)).toEqual(['2026-10-19T06:00:00.000Z', '2026-10-26T07:00:00.000Z']);
  });

  it('same without VTIMEZONE (IANA name only): the runtime zone database still gets daylight saving right', () => {
    const r = parseBusy(
      cal(
        ...event(
          'UID:cours',
          'DTSTART;TZID=Europe/Paris:20261019T080000',
          'DTEND;TZID=Europe/Paris:20261019T100000',
          'RRULE:FREQ=WEEKLY;COUNT=2',
        ),
      ),
      window,
    );
    expect(r.busy.map((b) => b.start)).toEqual(['2026-10-19T06:00:00.000Z', '2026-10-26T07:00:00.000Z']);
  });

  it('a floating time (no zone) is read in the user’s zone', () => {
    const r = parseBusy(cal(...event('UID:f', 'DTSTART:20261021T090000', 'DTEND:20261021T093000')), {
      ...window,
      timeZone: 'America/Montreal',
    });
    expect(r.busy[0]).toEqual({ start: '2026-10-21T13:00:00.000Z', end: '2026-10-21T13:30:00.000Z', allDay: false });
  });

  it('recurrences with EXDATE, a moved occurrence and a cancelled one', () => {
    const r = parseBusy(
      cal(
        ...event(
          'UID:td',
          'DTSTART:20261020T140000Z',
          'DTEND:20261020T150000Z',
          'RRULE:FREQ=DAILY;COUNT=5',
          'EXDATE:20261021T140000Z',
        ),
        // 22 Oct moved to 18:00.
        ...event('UID:td', 'RECURRENCE-ID:20261022T140000Z', 'DTSTART:20261022T180000Z', 'DTEND:20261022T190000Z'),
        // 23 Oct cancelled.
        ...event(
          'UID:td',
          'RECURRENCE-ID:20261023T140000Z',
          'DTSTART:20261023T140000Z',
          'DTEND:20261023T150000Z',
          'STATUS:CANCELLED',
        ),
      ),
      window,
    );
    expect(r.busy.map((b) => b.start)).toEqual([
      '2026-10-20T14:00:00.000Z',
      '2026-10-22T18:00:00.000Z',
      '2026-10-24T14:00:00.000Z',
    ]);
  });

  it('cancelled and "free" events are not busy', () => {
    const r = parseBusy(
      cal(
        ...event('UID:a', 'DTSTART:20261020T080000Z', 'DTEND:20261020T090000Z', 'STATUS:CANCELLED'),
        ...event('UID:b', 'DTSTART:20261020T100000Z', 'DTEND:20261020T110000Z', 'TRANSP:TRANSPARENT'),
        ...event('UID:c', 'DTSTART:20261020T120000Z', 'DTEND:20261020T130000Z', 'STATUS:CONFIRMED'),
      ),
      window,
    );
    expect(r.busy).toEqual([{ start: '2026-10-20T12:00:00.000Z', end: '2026-10-20T13:00:00.000Z', allDay: false }]);
  });

  it('all-day events stay dates, marked all-day (end exclusive)', () => {
    const r = parseBusy(
      cal(
        ...event('UID:v', 'DTSTART;VALUE=DATE:20261024', 'DTEND;VALUE=DATE:20261102', 'SUMMARY:Vacances'),
        ...event('UID:e', 'DTSTART;VALUE=DATE:20261105'),
      ),
      window,
    );
    expect(r.busy).toEqual([
      { start: '2026-10-24', end: '2026-11-02', allDay: true },
      { start: '2026-11-05', end: '2026-11-06', allDay: true },
    ]);
  });

  it('overlapping and touching events merge into one busy range', () => {
    const r = parseBusy(
      cal(
        ...event('UID:1', 'DTSTART:20261020T080000Z', 'DTEND:20261020T100000Z'),
        ...event('UID:2', 'DTSTART:20261020T093000Z', 'DTEND:20261020T110000Z'),
        ...event('UID:3', 'DTSTART:20261020T110000Z', 'DTEND:20261020T120000Z'),
        ...event('UID:4', 'DTSTART:20261020T150000Z', 'DTEND:20261020T160000Z'),
      ),
      window,
    );
    expect(r.busy).toEqual([
      { start: '2026-10-20T08:00:00.000Z', end: '2026-10-20T12:00:00.000Z', allDay: false },
      { start: '2026-10-20T15:00:00.000Z', end: '2026-10-20T16:00:00.000Z', allDay: false },
    ]);
    expect(r.eventCount).toBe(4);
  });

  it('only the planning window is kept; an old daily series still reaches it', () => {
    const r = parseBusy(
      cal(
        ...event('UID:old', 'DTSTART:20200101T120000Z', 'DTEND:20200101T130000Z'),
        ...event('UID:daily', 'DTSTART:20150105T070000Z', 'DTEND:20150105T073000Z', 'RRULE:FREQ=DAILY'),
      ),
      { ...window, to: new Date('2026-10-22T00:00:00Z') },
    );
    expect(r.busy.map((b) => b.start)).toEqual([
      '2026-10-19T07:00:00.000Z',
      '2026-10-20T07:00:00.000Z',
      '2026-10-21T07:00:00.000Z',
    ]);
  });

  it('a large feed is bounded and says so', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      event(
        `UID:${i}`,
        `DTSTART:202610${20 + (i % 10)}T${String(6 + (i % 12)).padStart(2, '0')}0000Z`,
        `DTEND:202610${20 + (i % 10)}T${String(6 + (i % 12)).padStart(2, '0')}3000Z`,
      ),
    ).flat();
    const r = parseBusy(cal(...many), { ...window, maxOccurrences: 100 });
    expect(r.truncated).toBe(true);
    expect(r.eventCount).toBe(100);
  });

  it('zero-length events and garbage are not busy; a non-calendar text throws', () => {
    expect(
      parseBusy(cal(...event('UID:z', 'DTSTART:20261020T080000Z', 'DTEND:20261020T080000Z')), window).busy,
    ).toEqual([]);
    expect(() => parseBusy('<html></html>', window)).toThrow();
  });

  it('wall time → UTC around the October change in Paris', () => {
    const at = (h: number) =>
      new Date(
        wallTimeToUtc({ year: 2026, month: 10, day: 25, hour: h, minute: 30, second: 0 }, 'Europe/Paris'),
      ).toISOString();
    expect(at(1)).toBe('2026-10-24T23:30:00.000Z');
    expect(at(4)).toBe('2026-10-25T03:30:00.000Z');
  });
});
