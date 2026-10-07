/**
 * Mass units (W-8, D-043). The domain keeps one canonical unit, the kilogram: every stored weight,
 * load, record and prescription is in kg. The user's unit only changes how a value is shown and
 * how a typed value is read: kg → display once, typed → kg once. Nothing stored is ever converted,
 * so switching kg ↔ lb never changes a past value.
 *
 * Lengths (height, waist, measurements) stay in centimetres: no other length unit is supported.
 */

export const MASS_UNITS = ['kg', 'lb'] as const;
export type MassUnit = (typeof MASS_UNITS)[number];

/** Exact international definition (1959). */
export const KG_PER_LB = 0.45359237;

/** How a mass is rounded for display: 0.1 kg, 0.1 lb (never more precision than a scale gives). */
const DISPLAY_DECIMALS: Record<MassUnit, number> = { kg: 2, lb: 1 };

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/** A canonical kg value in the user's unit (for display only, never stored). */
export function fromKg(kg: number, unit: MassUnit): number {
  if (unit === 'kg') return round(kg, DISPLAY_DECIMALS.kg);
  return round(kg / KG_PER_LB, DISPLAY_DECIMALS.lb);
}

/**
 * A value typed in the user's unit, as kg to store (the only conversion on the way in). Kept at
 * full precision in lb, so 135 lb typed shows back as 135 lb.
 */
export function toKg(value: number, unit: MassUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

/** A load step of the catalogue (kg) in the user's unit, for the +/- buttons. */
export function stepIn(stepKg: number, unit: MassUnit): number {
  return unit === 'kg' ? stepKg : round(stepKg / KG_PER_LB, 1);
}

export const isMassUnit = (v: unknown): v is MassUnit => v === 'kg' || v === 'lb';
