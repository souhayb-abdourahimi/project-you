/** Design tokens (docs/DESIGN_SYSTEM.md). Components never hard-code colours or spacing. */
export const palette = {
  light: {
    background: '#FAF8F5',
    surface: '#FFFFFF',
    surfaceMuted: '#F1EDE8',
    border: '#E4DED6',
    text: '#1B1917',
    textMuted: '#5F5850',
    primary: '#B9431C',
    onPrimary: '#FFFFFF',
    success: '#2F6B4F',
    warning: '#8A5A00',
    danger: '#B3261E',
    mock: '#6B4FA0',
  },
  dark: {
    background: '#121110',
    surface: '#1C1A18',
    surfaceMuted: '#26231F',
    border: '#3A3530',
    text: '#F5F2EE',
    textMuted: '#B4ACA2',
    primary: '#FF9166',
    onPrimary: '#1B1917',
    success: '#7CC9A0',
    warning: '#F2C46B',
    danger: '#F2B8B5',
    mock: '#C9B6F0',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof typeof palette.light;
export type Colors = Record<ColorToken, string>;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 } as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Minimum touch target (WCAG 2.5.5 / platform guidelines). */
export const MIN_TOUCH = 44;
export const MAX_CONTENT_WIDTH = 720;
export const WIDE_BREAKPOINT = 1024;
export const ANIMATION_MS = 200;
