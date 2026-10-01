import { isClientSafeKey } from '../keys';

const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`;

describe('isClientSafeKey', () => {
  it('accepts publishable and legacy anon keys', () => {
    expect(isClientSafeKey('sb_publishable_abc')).toBe(true);
    expect(isClientSafeKey(jwt({ role: 'anon' }))).toBe(true);
  });

  it('refuses secret and service_role keys, and garbage', () => {
    expect(isClientSafeKey('sb_secret_abc')).toBe(false);
    expect(isClientSafeKey(jwt({ role: 'service_role' }))).toBe(false);
    expect(isClientSafeKey('')).toBe(false);
    expect(isClientSafeKey('not-a-key')).toBe(false);
  });
});
