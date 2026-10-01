/** Least-recently-used rotation of the coach's wording, shared by every channel. */
import type { VoiceUse } from './types';

export function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Last time (`date T time`) each key was used; '' = never. */
export function lastUses(uses: VoiceUse[], keyOf: (u: VoiceUse) => string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const u of uses) {
    const at = `${u.date}T${u.time}`;
    for (const k of keyOf(u)) if ((out.get(k) ?? '') < at) out.set(k, at);
  }
  return out;
}

/**
 * Least recently used first; among never-used (or equally old) items, a rotation seeded by `seed`
 * so two users or two days do not always start with the same wording.
 */
export function leastRecentlyUsed<T>(items: T[], lastUse: (item: T) => string, seed: string): T[] {
  const offset = items.length ? hash(seed) % items.length : 0;
  return items
    .map((item, i) => ({ item, at: lastUse(item), order: (i - offset + items.length) % items.length }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order)
    .map((x) => x.item);
}
