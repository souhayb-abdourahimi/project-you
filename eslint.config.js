// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/functions/*'],
  },
  {
    // Zod pattern: a schema constant and its inferred type share one name.
    rules: { '@typescript-eslint/no-redeclare': 'off' },
  },
  {
    // The domain layer is pure TypeScript: no UI, platform or backend imports (docs/ARCHITECTURE.md).
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'expo', 'expo-*', '@expo/*', '@supabase/*', '@/*'], message: 'src/domain must stay pure.' },
          ],
        },
      ],
    },
  },
]);
