import { View } from 'react-native';

import { iconSize, useColors, type ColorToken } from '@/theme';

import { ICONS, type IconName } from './icons';

export { ICONS, type IconName } from './icons';

export type IconProps = {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: ColorToken;
  /** A raw colour, for an icon drawn on a coloured surface (the tab bar). */
  tint?: string;
};

/**
 * Web and Android: the icon is a vector drawing (react-native-svg), never a character of an icon
 * font, so a font that is slow, blocked or evicted can never show a box instead (D-048). Native
 * iOS draws the SF Symbol instead (Icon.ios.tsx).
 */
export function Icon({ name, size = 'md', color = 'textSecondary', tint }: IconProps) {
  const colors = useColors();
  const px = typeof size === 'number' ? size : iconSize[size];
  const { svg: Glyph, ...entry } = ICONS[name];
  const ink = tint ?? colors[color];
  // Decorative: the element that carries the icon carries its accessible name.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={`icon-${name}`}
      style={{ width: px, height: px }}>
      <Glyph
        size={px}
        color={ink}
        // Close to the SF Symbols "medium" weight at every size.
        strokeWidth={px <= 16 ? 2.25 : 2}
        fill={'filled' in entry && entry.filled ? ink : 'none'}
      />
    </View>
  );
}
