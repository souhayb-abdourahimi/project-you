import { fromKg, type MassUnit } from '@/domain/settings/units';

export function formatMoney(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency }).format(
    cents / 100,
  );
}

export function formatDate(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, d));
}

/** Month-level date ("février 2027") for estimates, to avoid false day-level precision. */
export function formatMonth(date: string, locale: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  );
}

export function nowTime(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Parses "1,5" or "1.5"; returns undefined for empty or invalid input. */
export function parseNumber(text: string): number | undefined {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A load or any decimal as the user reads it ("67,5" in French). */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 2 }).format(value);
}

/**
 * A number the screens already formatted for the locale ("67,5", "1,234.5", "+0,3"), read back.
 * Used by the mass formatter, which receives values from generic parameter maps.
 */
export function parseLocalized(value: unknown, locale: string): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[\s\u00a0\u202f]/g, '').replace('\u2212', '-');
  // The last separator is the decimal one; a lone comma is a decimal comma, except English thousands.
  const comma = clean.lastIndexOf(',');
  const dot = clean.lastIndexOf('.');
  const englishThousands = locale === 'en' && /^[+-]?\d{1,3}(,\d{3})+$/.test(clean);
  const normalized =
    comma > dot && !englishThousands ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
  const n = Number(normalized);
  return clean === '' || Number.isNaN(n) ? undefined : n;
}

/**
 * A mass stored in kg, in the user's unit ("67,5 kg", "148.8 lb"). The only place a stored mass is
 * converted for display (D-043); a sign typed by the caller ("+0,3") is kept.
 */
export function formatMass(valueKg: unknown, locale: string, unit: MassUnit): string {
  const kg = parseLocalized(valueKg, locale);
  if (kg === undefined) return String(valueKg);
  const plus = typeof valueKg === 'string' && valueKg.trim().startsWith('+') ? '+' : '';
  return `${plus}${formatNumber(fromKg(kg, unit), locale)} ${unit}`;
}
