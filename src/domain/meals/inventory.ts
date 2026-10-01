import type { IsoDate } from '../shared/dates';
import { daysBetween } from '../shared/dates';
import { getFood } from './catalog';

export type InventoryUnit = 'g' | 'ml' | 'piece';
export type InventorySource = 'manual' | 'barcode' | 'receipt' | 'photo';

export interface InventoryItem {
  id: string;
  /** Catalogue food when known; free-text items without a food id are kept but not used for planning. */
  foodId: string | null;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  category: string;
  expiresOn: IsoDate | null;
  source: InventorySource;
  addedAt: string;
  updatedAt: string;
}

/**
 * Grams available for an item. Millilitres are treated as grams (close enough for the liquids
 * we track); pieces use the food's average piece mass.
 */
export function gramsOf(item: InventoryItem): number {
  if (item.unit === 'piece') {
    const perPiece = item.foodId ? getFood(item.foodId)?.gramsPerPiece : undefined;
    return perPiece ? item.quantity * perPiece : 0;
  }
  return item.quantity;
}

/** Grams available per food id. */
export function stockByFood(items: InventoryItem[]): Map<string, number> {
  const stock = new Map<string, number>();
  for (const item of items) {
    if (!item.foodId || item.quantity <= 0) continue;
    stock.set(item.foodId, (stock.get(item.foodId) ?? 0) + gramsOf(item));
  }
  return stock;
}

export function isExpiringSoon(item: InventoryItem, today: IsoDate, withinDays = 3): boolean {
  return item.expiresOn !== null && daysBetween(today, item.expiresOn) <= withinDays;
}

/** Consumes `grams` of a food across items, soonest expiry first. Returns the updated items. */
export function consume(items: InventoryItem[], foodId: string, grams: number, now: string): InventoryItem[] {
  let remaining = grams;
  const order = [...items]
    .filter((i) => i.foodId === foodId && i.quantity > 0)
    .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'));
  const updates = new Map<string, InventoryItem>();
  for (const item of order) {
    if (remaining <= 0) break;
    const available = gramsOf(item);
    if (available <= 0) continue;
    const used = Math.min(available, remaining);
    remaining -= used;
    const ratio = (available - used) / available;
    updates.set(item.id, { ...item, quantity: roundQuantity(item.quantity * ratio, item.unit), updatedAt: now });
  }
  return items.map((i) => updates.get(i.id) ?? i);
}

function roundQuantity(quantity: number, unit: InventoryUnit): number {
  return unit === 'piece' ? Math.round(quantity * 10) / 10 : Math.round(quantity);
}
