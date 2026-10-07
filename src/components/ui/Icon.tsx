import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

import { iconSize, useColors, type ColorToken } from '@/theme';

/**
 * One icon family for the whole app (W-9): SF Symbols on iOS, Material Symbols on Android and the
 * web (both through expo-symbols, already a dependency). Screens name an icon by what it means;
 * this table is the only place that knows the platform glyphs.
 */
export const ICONS = {
  today: { sf: 'sun.max', md: 'today' },
  program: { sf: 'calendar', md: 'calendar_month' },
  nutrition: { sf: 'fork.knife', md: 'restaurant' },
  progress: { sf: 'chart.line.uptrend.xyaxis', md: 'monitoring' },
  profile: { sf: 'person.crop.circle', md: 'account_circle' },
  settings: { sf: 'gearshape', md: 'settings' },
  workout: { sf: 'figure.strengthtraining.traditional', md: 'fitness_center' },
  walk: { sf: 'figure.walk', md: 'directions_walk' },
  mobility: { sf: 'figure.mind.and.body', md: 'self_improvement' },
  rest: { sf: 'moon', md: 'bedtime' },
  meal: { sf: 'fork.knife', md: 'restaurant' },
  checkin: { sf: 'checklist', md: 'event_repeat' },
  weight: { sf: 'scalemass', md: 'scale' },
  steps: { sf: 'figure.walk', md: 'footprint' },
  protein: { sf: 'leaf', md: 'nutrition' },
  sessions: { sf: 'flame', md: 'local_fire_department' },
  time: { sf: 'clock', md: 'schedule' },
  coach: { sf: 'sparkles', md: 'auto_awesome' },
  safety: { sf: 'heart.text.square', md: 'health_and_safety' },
  offline: { sf: 'icloud.slash', md: 'cloud_off' },
  sync: { sf: 'arrow.triangle.2.circlepath', md: 'sync' },
  done: { sf: 'checkmark.circle.fill', md: 'check_circle' },
  todo: { sf: 'circle', md: 'radio_button_unchecked' },
  check: { sf: 'checkmark', md: 'check' },
  chevron: { sf: 'chevron.right', md: 'chevron_right' },
  arrow: { sf: 'arrow.right', md: 'arrow_forward' },
  info: { sf: 'info.circle', md: 'info' },
  bolt: { sf: 'bolt', md: 'bolt' },
  history: { sf: 'clock.arrow.circlepath', md: 'history' },
  shopping: { sf: 'cart', md: 'shopping_cart' },
  celebrate: { sf: 'star', md: 'auto_awesome' },
} as const satisfies Record<string, { sf: SFSymbol; md: string }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 'md',
  color = 'textSecondary',
  tint,
}: {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: ColorToken;
  /** A raw colour, for an icon drawn on a coloured surface (the tab bar). */
  tint?: string;
}) {
  const colors = useColors();
  const px = typeof size === 'number' ? size : iconSize[size];
  const glyph = ICONS[name];
  // Decorative: the element that carries the icon carries its accessible name.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SymbolView
        name={{ ios: glyph.sf, android: glyph.md as never, web: glyph.md as never }}
        size={px}
        tintColor={tint ?? colors[color]}
        weight="medium"
        fallback={<View style={{ width: px, height: px }} />}
      />
    </View>
  );
}
