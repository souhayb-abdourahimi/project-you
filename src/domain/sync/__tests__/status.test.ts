import { NOTEWORTHY, syncView } from '../status';

const view = (patch: Partial<Parameters<typeof syncView>[0]>) =>
  syncView({ signedIn: true, phase: 'idle', pending: 0, errors: [], ...patch });

describe('syncView (never a technical code)', () => {
  it('maps every situation to one plain state', () => {
    expect(view({ signedIn: false, phase: 'error', errors: [{ kind: 'rls' }] })).toBe('local_only');
    expect(view({})).toBe('up_to_date');
    expect(view({ pending: 2 })).toBe('pending');
    expect(view({ phase: 'syncing', pending: 2 })).toBe('syncing');
    expect(view({ phase: 'offline', pending: 2 })).toBe('offline');
    expect(view({ phase: 'error', errors: [{ kind: 'validation' }, { kind: 'rls' }] })).toBe('sign_in_again');
    expect(view({ phase: 'error', errors: [{ kind: 'server' }] })).toBe('not_sent');
  });
  it('the main screens only hear about what needs attention', () => {
    expect(NOTEWORTHY).not.toContain('up_to_date');
    expect(NOTEWORTHY).not.toContain('syncing');
    expect(NOTEWORTHY).toContain('offline');
  });
});
