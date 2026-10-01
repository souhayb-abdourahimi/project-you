/**
 * Live tests against the real Supabase project run in plain Node, without the jest-expo preset:
 * jest-expo replaces `fetch` with Expo's native fetch stub, whose responses cannot be read
 * outside an app ("undefined" is not valid JSON at sign-in).
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.live.test.ts'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
