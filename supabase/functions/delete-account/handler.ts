/**
 * Account deletion (Privacy Center). Runtime-agnostic so it can be unit-tested with Jest;
 * `index.ts` wires it to Deno and the Supabase admin client.
 * Order: authenticate the caller from their own JWT → delete their photos → delete the auth user
 * (every personal table cascades from auth.users). The user id never comes from the request body.
 */
export interface DeleteAccountDeps {
  /** Resolves the user from the caller's access token; null when invalid or expired. */
  getUserId: (accessToken: string) => Promise<string | null>;
  listPhotos: (prefix: string) => Promise<string[]>;
  removePhotos: (paths: string[]) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

export interface HandlerResponse {
  status: number;
  body: { ok: true } | { error: 'method_not_allowed' | 'unauthorized' | 'deletion_failed' };
}

export async function handleDeleteAccount(
  request: { method: string; authorization: string | null },
  deps: DeleteAccountDeps,
): Promise<HandlerResponse> {
  if (request.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  const userId = await deps.getUserId(token).catch(() => null);
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  try {
    const photos = await deps.listPhotos(`${userId}/`);
    if (photos.length > 0) await deps.removePhotos(photos);
    await deps.deleteUser(userId);
    return { status: 200, body: { ok: true } };
  } catch {
    // Never echo internals (security rules): the client shows a generic retry message.
    return { status: 500, body: { error: 'deletion_failed' } };
  }
}
