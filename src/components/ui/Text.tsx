import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { HEADING_VARIANTS, typography, useColors, type ColorToken, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & { variant?: TypographyVariant; color?: ColorToken };

export function Text({ variant = 'body', color = 'textPrimary', style, ...rest }: TextProps) {
  const colors = useColors();
  const role = HEADING_VARIANTS.includes(variant) ? 'header' : undefined;
  return (
    <RNText
      accessibilityRole={role}
      style={[typography[variant] as TextStyle, { color: colors[color] }, style]}
      {...rest}
    />
  );
}
