import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { iconSize, useColors } from '@/theme';

import type { IconProps } from './Icon';
import { ICONS } from './icons';

export { ICONS, type IconName } from './icons';
export type { IconProps } from './Icon';

/**
 * Native iOS: the SF Symbol drawn by the system (an image, not a font). The web build, including
 * Safari on iPhone, never uses this file: it draws the vector icons of Icon.tsx (D-048).
 */
export function Icon({ name, size = 'md', color = 'textSecondary', tint }: IconProps) {
  const colors = useColors();
  const px = typeof size === 'number' ? size : iconSize[size];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SymbolView
        name={ICONS[name].sf}
        size={px}
        tintColor={tint ?? colors[color]}
        weight="medium"
        fallback={<View style={{ width: px, height: px }} />}
      />
    </View>
  );
}
