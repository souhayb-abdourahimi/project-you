import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme, type ViewStyle } from 'react-native';

import { palette, type ColorScheme, type Colors } from './tokens';

export * from './tokens';

export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useColors(): Colors {
  return palette[useScheme()];
}

/** True while the system asks for less motion: every animation is then skipped. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduced(value))
      .catch(() => alive && setReduced(false));
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}

/** A CSS gradient as a style: `backgroundImage` on the web, the native equivalent elsewhere. */
export function gradientStyle(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}
