import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme, useWindowDimensions, type ViewStyle } from 'react-native';

import { COMPACT_HEIGHT, COMPACT_WIDTH, palette, type ColorScheme, type Colors } from './tokens';

export * from './tokens';

export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useColors(): Colors {
  return palette[useScheme()];
}

/** True on a small phone: spacing tightens a little there, never the touch targets nor the desktop. */
export function useCompact(): boolean {
  const { width, height } = useWindowDimensions();
  return width < COMPACT_WIDTH || height < COMPACT_HEIGHT;
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
