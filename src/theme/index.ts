import { useColorScheme } from 'react-native';

import { palette, type ColorScheme, type Colors } from './tokens';

export * from './tokens';

export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useColors(): Colors {
  return palette[useScheme()];
}
