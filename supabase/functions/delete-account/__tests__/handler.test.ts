import { handleDeleteAccount, type DeleteAccountDeps } from '../handler';

function deps(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const d: DeleteAccountDeps = {
    getUserId: async (t) => (t === 'valid' ? 'user-a' : null),
    listPhotos: async (prefix) => [`${prefix}1.jpg`],
    removePhotos: async (paths) => void calls.push(`photos:${paths.join(',')}`),
    deleteUser: async (id) => void calls.push(`user:${id}`),
    ...overrides,
  };
  return { d, calls };
}

describe('delete-account', () => {
  it('deletes the caller photos then the account', async () => {
    const { d, calls } = deps();
    const r = await handleDeleteAccount({ method: 'POST', authorization: 'Bearer valid' }, d);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual(['photos:user-a/1.jpg', 'user:user-a']);
  });

  it('refuses without a valid token and never deletes', async () => {
    for (const authorization of [null, 'Bearer nope', 'Basic x']) {
      const { d, calls } = deps();
      const r = await handleDeleteAccount({ method: 'POST', authorization }, d);
      expect(r.status).toBe(401);
      expect(calls).toEqual([]);
    }
  });

  it('only accepts POST', async () => {
    const { d } = deps();
    expect((await handleDeleteAccount({ method: 'GET', authorization: 'Bearer valid' }, d)).status).toBe(405);
  });

  it('does not delete the user when photo deletion fails, and hides internals', async () => {
    const { d, calls } = deps({
      removePhotos: async () => {
        throw new Error('storage exploded: secret detail');
      },
    });
    const r = await handleDeleteAccount({ method: 'POST', authorization: 'Bearer valid' }, d);
    expect(r).toEqual({ status: 500, body: { error: 'deletion_failed' } });
    expect(calls).toEqual([]);
  });
});
