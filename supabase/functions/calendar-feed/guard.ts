/**
 * SSRF guard for the iCal link (D-049). Pure and runtime-agnostic (tested with Jest): the function
 * only ever fetches a public HTTPS address on the default port, every redirect is checked again,
 * and every address a host name resolves to must be public. Nothing here logs the link: it often
 * carries a personal token.
 */

export type GuardFailure = 'invalid_url' | 'not_https' | 'blocked_address';

export const MAX_URL_LENGTH = 2048;

/**
 * The link to fetch, or why it is refused. `webcal://` (what calendar apps share) means HTTPS.
 * Refused: another scheme (http included), credentials in the link, another port, a host that is
 * an internal name or a non-public IP literal (decimal and hex IPv4 forms are normalised by URL).
 */
export function readFeedUrl(raw: unknown): { ok: true; url: URL } | { ok: false; failure: GuardFailure } {
  if (typeof raw !== 'string') return { ok: false, failure: 'invalid_url' };
  const text = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  if (text.length === 0 || text.length > MAX_URL_LENGTH) return { ok: false, failure: 'invalid_url' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, failure: 'invalid_url' };
  }
  return checkUrl(url);
}

export function checkUrl(url: URL): { ok: true; url: URL } | { ok: false; failure: GuardFailure } {
  if (url.protocol !== 'https:') return { ok: false, failure: 'not_https' };
  if (url.username || url.password) return { ok: false, failure: 'invalid_url' };
  if (url.port && url.port !== '443') return { ok: false, failure: 'blocked_address' };
  const host = hostOf(url);
  if (!host) return { ok: false, failure: 'invalid_url' };
  if (isIpLiteral(host)) return isPublicIp(host) ? { ok: true, url } : { ok: false, failure: 'blocked_address' };
  if (isInternalName(host)) return { ok: false, failure: 'blocked_address' };
  return { ok: true, url };
}

/** Host name without IPv6 brackets or a trailing dot, lower case. */
export function hostOf(url: URL): string {
  return url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.home.arpa'];

/** Names that only mean something inside a network (or a cloud's metadata service). */
export function isInternalName(host: string): boolean {
  if (!host.includes('.')) return true; // "localhost", "metadata", any single-label name
  return INTERNAL_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** Non-public IPv4 ranges (RFC 6890 and friends): private, loopback, link-local, CGNAT, docs… */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isPublicV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return !BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (ipv4ToInt(base)! & mask) >>> 0;
  });
}

/** Expands an IPv6 address into its 8 groups (null when malformed). */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0];
  // An embedded IPv4 tail (::ffff:127.0.0.1) becomes two groups.
  const v4 = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    if (n === null) return null;
    text = text.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) =>
    /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN,
  );
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the IPv4.
  const embedded = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isPublicV4(embedded);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicV4(embedded);
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard prefix
  // 6to4 (2002::/16) carries an IPv4 in groups 1-2.
  if (g[0] === 0x2002) return isPublicV4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`);
  return true;
}

export function isPublicIp(ip: string): boolean {
  return ip.includes(':') ? isPublicV6(ip) : isPublicV4(ip);
}
