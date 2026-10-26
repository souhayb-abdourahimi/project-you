/**
 * Routing after sign-in (onboarding bug of 2026-10-26): the server's profile decides, and "no
 * profile" is decided only from a pull of the current account that reached the server.
 */
import { profileGate, type ProfileGateInput } from '../profileGate';

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';

const base: ProfileGateInput = {
  supabaseConfigured: true,
  userId: null,
  localMode: false,
  hasSnapshot: false,
  ownerId: null,
  firstPull: null,
};
const gate = (patch: Partial<ProfileGateInput>) => profileGate({ ...base, ...patch });

describe('profileGate', () => {
  it('signed out with an account service: sign in (or local mode, which keeps its own profile)', () => {
    expect(gate({})).toBe('sign-in');
    expect(gate({ localMode: true })).toBe('onboarding');
    expect(gate({ localMode: true, hasSnapshot: true })).toBe('app');
  });

  it('no account service: the device profile decides', () => {
    expect(gate({ supabaseConfigured: false })).toBe('onboarding');
    expect(gate({ supabaseConfigured: false, hasSnapshot: true })).toBe('app');
  });

  it('fresh install + existing account: waits during the pull, then the restored profile opens the app', () => {
    // Just signed in: the device data is not attached to the account yet.
    expect(gate({ userId: A })).toBe('wait');
    // Attached, pull running.
    expect(gate({ userId: A, ownerId: A })).toBe('wait');
    // Pull done: the profile came back.
    expect(gate({ userId: A, ownerId: A, hasSnapshot: true, firstPull: { userId: A, outcome: 'reached' } })).toBe(
      'app',
    );
  });

  it('fresh install + new account: waits, then onboarding once the server said there is no profile', () => {
    expect(gate({ userId: A, ownerId: A })).toBe('wait');
    expect(gate({ userId: A, ownerId: A, firstPull: { userId: A, outcome: 'reached' } })).toBe('onboarding');
  });

  it('a first round that could not reach the server never leads to onboarding', () => {
    expect(gate({ userId: A, ownerId: A, firstPull: { userId: A, outcome: 'unreachable' } })).toBe('unreachable');
  });

  it("account switch: the previous account's profile is never shown, and its pull never decides", () => {
    // B signs in on a device still holding A's profile.
    expect(gate({ userId: B, ownerId: A, hasSnapshot: true, firstPull: { userId: A, outcome: 'reached' } })).toBe(
      'wait',
    );
    // Device cleared and attached to B: A's finished pull says nothing about B.
    expect(gate({ userId: B, ownerId: B, firstPull: { userId: A, outcome: 'reached' } })).toBe('wait');
    expect(gate({ userId: B, ownerId: B, firstPull: { userId: B, outcome: 'reached' } })).toBe('onboarding');
  });

  it('a "done" left over from the signed-out state or an earlier session never sends to onboarding', () => {
    // Signed out then back in on the same account: the device was cleared (owner null).
    expect(gate({ userId: A, ownerId: null, firstPull: { userId: A, outcome: 'reached' } })).toBe('wait');
  });

  it('signed in with the profile already on this device: the app opens at once, even offline', () => {
    expect(gate({ userId: A, ownerId: A, hasSnapshot: true })).toBe('app');
    expect(gate({ userId: A, ownerId: A, hasSnapshot: true, firstPull: { userId: A, outcome: 'unreachable' } })).toBe(
      'app',
    );
  });
});
