/**
 * The iCal link at rest (D-049): AES-256-GCM with the CALENDAR_FEED_KEY secret (32 random bytes,
 * base64), a fresh IV per encryption, and the user id as additional data, so a ciphertext copied
 * to another account cannot be decrypted there. WebCrypto only (Deno and Node alike).
 */
const b64url = {
  encode: (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  decode: (text: string) => {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  },
};

/** The key from its base64 secret, or null when missing or not 32 bytes. */
export async function importFeedKey(secret: string | undefined): Promise<CryptoKey | null> {
  if (!secret) return null;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = Uint8Array.from(atob(secret.trim()), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptUrl(key: CryptoKey, url: string, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(url);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(userId) },
    key,
    data,
  );
  return `v1.${b64url.encode(iv)}.${b64url.encode(new Uint8Array(sealed))}`;
}

/** The link, or null when the ciphertext is not this user's or was altered. */
export async function decryptUrl(key: CryptoKey, sealed: string, userId: string): Promise<string | null> {
  const [version, iv, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !body) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64url.decode(iv), additionalData: new TextEncoder().encode(userId) },
      key,
      b64url.decode(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
