/**
 * Deterministic ids: the same input gives the same id on every device, so a retry, a restart or a
 * second device writes the same row instead of a duplicate (D-015, D-032).
 */
/** Deterministic, non-cryptographic 128-bit hash formatted as a UUID (cyrb128). */
export function stableUuid(text: string): string {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((h) => (h >>> 0).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** One workout session of the week: `${date}#${sessionIndex}`. */
export type SessionKey = string;

export function sessionKey(date: string, sessionIndex: number): SessionKey {
  return `${date}#${sessionIndex}`;
}

export function parseSessionKey(key: SessionKey): { date: string; sessionIndex: number } {
  const [date, index] = key.split('#');
  return { date, sessionIndex: Number(index) };
}
