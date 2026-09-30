import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  compact?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
  compact,
}: ButtonProps) {
  const colors = useColors();
  const background = {
    primary: colors.primary,
    secondary: colors.surfaceMuted,
    ghost: 'transparent',
    danger: 'transparent',
  }[variant];
  const foreground = { primary: 'onPrimary', secondary: 'text', ghost: 'primary', danger: 'danger' } as const;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: background, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
      ]}>
      {loading ? (
        <ActivityIndicator color={colors[foreground[variant]]} />
      ) : (
        <Text variant="label" color={foreground[variant]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: spacing.md },
});
