import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography, useColors, type ColorToken, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & { variant?: TypographyVariant; color?: ColorToken };

export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const colors = useColors();
  const role = variant === 'display' || variant === 'title' || variant === 'heading' ? 'header' : undefined;
  return <RNText accessibilityRole={role} style={[typography[variant], { color: colors[color] }, style]} {...rest} />;
}
