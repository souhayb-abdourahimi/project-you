import i18n, { setMassUnit } from '@/i18n';

import { formatMass, formatWeekRange, parseLocalized } from '../format';

describe('parseLocalized', () => {
  it('reads French and English decimals, never multiplies by ten', () => {
    expect(parseLocalized('72,5', 'fr')).toBe(72.5);
    expect(parseLocalized('72.5', 'fr')).toBe(72.5);
    expect(parseLocalized('+0.3', 'fr')).toBe(0.3);
    expect(parseLocalized('1,234', 'en')).toBe(1234);
    expect(parseLocalized('1 234,5', 'fr')).toBe(1234.5);
    expect(parseLocalized('−2,5', 'fr')).toBe(-2.5);
    expect(parseLocalized('abc', 'fr')).toBeUndefined();
    expect(parseLocalized(Number.NaN, 'fr')).toBeUndefined();
  });
});

describe('formatMass', () => {
  it('shows a canonical kg value in the chosen unit, keeping a sign', () => {
    expect(formatMass(80, 'fr', 'kg')).toMatch(/^80\s?kg$/);
    expect(formatMass(80, 'en', 'lb')).toMatch(/^176\.4\s?lb$/);
    expect(formatMass('+0.5', 'fr', 'kg')).toMatch(/^\+0,5\s?kg$/);
  });
});

describe('mass formatter of the texts', () => {
  afterEach(() => setMassUnit('kg'));
  it('every "{{x, mass}}" follows the unit of the profile, the stored value unchanged', async () => {
    await i18n.changeLanguage('fr');
    const value = 80;
    setMassUnit('kg');
    expect(i18n.t('{{v, mass}}' as never, { v: value })).toMatch(/80\s?kg/);
    setMassUnit('lb');
    expect(i18n.t('{{v, mass}}' as never, { v: value })).toMatch(/176,4\s?lb/);
    expect(value).toBe(80);
  });
});

describe('formatWeekRange', () => {
  it('says a week from its Monday, across months', () => {
    expect(formatWeekRange('2026-09-28', 'fr')).toBe('28 sept. – 4 oct.');
    expect(formatWeekRange('2026-10-05', 'en')).toBe('5 Oct – 11 Oct');
  });
});
