/** ISO calendar date, `YYYY-MM-DD`, interpreted in the user's local time zone. */
export type IsoDate = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MS = 86_400_000;

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function weekdayOf(date: IsoDate): Weekday {
  const day = new Date(toUtc(date)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, 1 - weekdayOf(date));
}

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `HH:MM` → minutes since midnight. */
export function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
