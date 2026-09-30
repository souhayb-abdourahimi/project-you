/** Refuses anything that looks like a server key, so a misconfigured env never ships it. */
export function isClientSafeKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return false;
  if (key.startsWith('sb_publishable_')) return true;
  // Legacy JWT keys: accept only the `anon` role.
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
    return json.role === 'anon';
  } catch {
    return false;
  }
}
