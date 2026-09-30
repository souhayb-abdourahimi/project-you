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
