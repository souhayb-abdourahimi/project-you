/**
 * Design tokens of Project You (docs/DESIGN_SYSTEM.md, W-9). Screens and components never hard-code
 * a colour, a size, a radius, a shadow or a duration: they read them here.
 *
 * Light theme first (the premium reference); the dark theme carries the same names so every
 * component follows it without code, but it is not yet polished screen by screen.
 */
const light = {
  // Base
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSubtle: '#EDF0F4',
  /** Strong graphite surface (the hero of the day). */
  inverse: '#121722',
  onInverse: '#FFFFFF',
  onInverseMuted: '#AEB6C4',
  /** A chip or a well drawn on the inverse surface. */
  inverseFill: 'rgba(255, 255, 255, 0.12)',

  textPrimary: '#0F172A',
  textSecondary: '#475467',
  /** Secondary information, still readable (≥ 4.5:1 on every surface). */
  textMuted: '#5D6676',

  border: '#E3E7ED',
  borderStrong: '#C9D0DA',

  primary: '#1D4ED8',
  primaryPressed: '#1A43BA',
  primarySubtle: '#EBF0FD',
  onPrimary: '#FFFFFF',

  // Semantic
  success: '#1E7A4C',
  successSubtle: '#E8F4EE',
  warning: '#8A5300',
  warningSubtle: '#FBF4E6',
  danger: '#C0262D',
  dangerSubtle: '#FCEBEC',
  info: '#2C6E85',
  infoSubtle: '#E7F2F5',

  // Domains: used sparingly (a small icon, a thin accent), never as large fills.
  training: '#1D4ED8',
  nutrition: '#0F766E',
  progress: '#5B45D6',
  recovery: '#2C6E85',

  /** Mandatory marker on demo data (docs/DATA_SOURCES.md). */
  mock: '#6B4FA0',

  // Legacy names (pre W-9 screens), kept as aliases so every screen follows the new palette.
  text: '#0F172A',
  surfaceMuted: '#EDF0F4',
} as const;

export type ColorToken = keyof typeof light;
export type Colors = Record<ColorToken, string>;

const dark: Colors = {
  background: '#0B0D12',
  surface: '#151922',
  surfaceRaised: '#1B2030',
  surfaceSubtle: '#1F2533',
  inverse: '#1E2433',
  onInverse: '#F2F4F8',
  onInverseMuted: '#B4BCCA',
  inverseFill: 'rgba(255, 255, 255, 0.10)',

  textPrimary: '#F2F4F8',
  textSecondary: '#C3CAD6',
  textMuted: '#A3ACBB',

  border: '#2A3140',
  borderStrong: '#3A4354',

  primary: '#86A8FF',
  primaryPressed: '#6F94F2',
  primarySubtle: '#1C2A4D',
  onPrimary: '#0B1530',

  success: '#7CC9A0',
  successSubtle: '#163226',
  warning: '#F2C46B',
  warningSubtle: '#332712',
  danger: '#F2B8B5',
  dangerSubtle: '#3A1A1C',
  info: '#8CCBDD',
  infoSubtle: '#15303A',

  training: '#86A8FF',
  nutrition: '#6FD0C2',
  progress: '#B5A8FF',
  recovery: '#8CCBDD',

  mock: '#C9B6F0',

  text: '#F2F4F8',
  surfaceMuted: '#1F2533',
};

export const palette: Record<'light' | 'dark', Colors> = { light, dark };

export type ColorScheme = keyof typeof palette;

/** Base-4 scale. Prefer 8 · 12 · 16 · 20 · 24 · 32 between elements. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 } as const;

/** Layout rhythm of the premium screens (W-9). */
export const layout = {
  /** Side gutter of a screen. */
  screenPadding: 20,
  /** Inner padding of a card. */
  cardPadding: 20,
  /** Between two sections of a screen. */
  sectionGap: 28,
  /** Between two cards of the same section. */
  stackGap: 12,
} as const;

/** Soft but adult: large cards, firm buttons, pills only for chips. */
export const radius = {
  sm: 8,
  md: 12,
  input: 14,
  button: 16,
  lg: 20,
  card: 22,
  sheet: 28,
  pill: 999,
} as const;

export const borderWidth = { thin: 1, strong: 1.5 } as const;

/**
 * Very light elevation: on iOS a surface and a hairline usually suffice; a shadow only lifts what
 * floats (hero, raised card, tab bar).
 */
export const elevation = {
  none: {},
  card: { boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.05)' },
  raised: { boxShadow: '0 6px 20px rgba(16, 24, 40, 0.08), 0 1px 3px rgba(16, 24, 40, 0.06)' },
} as const;

/**
 * Type scale (system font: SF Pro / Roboto / system-ui). The legacy variants (title, heading, label)
 * stay for the screens not redesigned yet.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyMedium: { fontSize: 16, lineHeight: 23, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  /** Small capitals above a title ("ENTRAÎNEMENT"). */
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Tab bar labels. */
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
  metric: { fontSize: 26, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  metricLarge: { fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  // Legacy
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Variants announced as headings by screen readers. */
export const HEADING_VARIANTS: readonly TypographyVariant[] = [
  'display',
  'title1',
  'title2',
  'title3',
  'title',
  'heading',
];

/**
 * The only gradients of the app: a soft light behind the hero's artwork and the scrim that keeps
 * text readable over a photo. Never a decorative rainbow.
 */
export const gradients = {
  heroGlow:
    'radial-gradient(circle at 85% 20%, rgba(70, 116, 255, 0.55) 0%, rgba(29, 78, 216, 0.18) 38%, rgba(18, 23, 34, 0) 70%)',
  heroScrim:
    'linear-gradient(180deg, rgba(10, 13, 20, 0.10) 0%, rgba(10, 13, 20, 0.55) 55%, rgba(10, 13, 20, 0.92) 100%)',
} as const;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28 } as const;

/** Durations (ms). Every animation is skipped when Reduce Motion is on. */
export const motion = { fast: 120, base: 200, slow: 320 } as const;

export const opacity = { pressed: 0.86, disabled: 0.4, subtle: 0.6 } as const;

/** Scale of a pressed card or button: a touch, not a bounce. */
export const PRESSED_SCALE = 0.98;

/** Minimum touch target (WCAG 2.5.5 / platform guidelines). */
export const MIN_TOUCH = 44;
export const MAX_CONTENT_WIDTH = 640;
export const WIDE_BREAKPOINT = 1024;
/** Small phones (iPhone SE / mini, compact Android): a denser first screen, same touch targets. */
export const COMPACT_WIDTH = 380;
export const COMPACT_HEIGHT = 700;
export const ANIMATION_MS = motion.base;
