import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  MIN_TOUCH,
  PRESSED_SCALE,
  borderWidth,
  opacity,
  radius,
  spacing,
  useColors,
  type ColorToken,
  type Colors,
} from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * primary: the one main action of a screen or a card. secondary: a real alternative. tertiary: a
 * light action on a tinted fill. ghost: a link-like action. destructive: deletes or ends something
 * (filled only after a confirmation step). `danger` is the legacy name of a red text action.
 */
type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'destructive' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  /** A precise label when the visible one needs its context ("Pas maintenant : semaine allégée"). */
  accessibilityLabel?: string;
  compact?: boolean;
  /** Full width (the main action of a card). */
  block?: boolean;
  icon?: IconName;
  /** Drawn on the graphite hero surface. */
  onDark?: boolean;
  /** For a button that shows or hides content below it (announced as expanded / collapsed). */
  expanded?: boolean;
}

interface Look {
  background: ColorToken | 'transparent';
  pressed: ColorToken | 'transparent';
  foreground: ColorToken;
  border?: ColorToken;
}

function look(variant: Variant, onDark: boolean): Look {
  switch (variant) {
    case 'primary':
      return { background: 'primary', pressed: 'primaryPressed', foreground: 'onPrimary' };
    case 'secondary':
      return onDark
        ? { background: 'transparent', pressed: 'transparent', foreground: 'onInverse', border: 'onInverseMuted' }
        : { background: 'surface', pressed: 'surfaceSubtle', foreground: 'textPrimary', border: 'borderStrong' };
    case 'tertiary':
      return { background: 'primarySubtle', pressed: 'primarySubtle', foreground: 'primary' };
    case 'ghost':
      return { background: 'transparent', pressed: 'transparent', foreground: onDark ? 'onInverse' : 'primary' };
    case 'destructive':
      return { background: 'danger', pressed: 'danger', foreground: 'surface' };
    case 'danger':
      return { background: 'transparent', pressed: 'transparent', foreground: 'danger' };
  }
}

const fill = (colors: Colors, token: ColorToken | 'transparent') => (token === 'transparent' ? token : colors[token]);

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
  accessibilityLabel,
  compact,
  block,
  icon,
  onDark = false,
  expanded,
}: ButtonProps) {
  const colors = useColors();
  const l = look(variant, onDark);
  const inactive = disabled || loading;
  const flat = variant === 'ghost' || variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading, expanded }}
      aria-expanded={expanded}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        flat && styles.flat,
        block && styles.block,
        {
          backgroundColor: fill(colors, pressed ? l.pressed : l.background),
          opacity: inactive ? opacity.disabled : pressed && flat ? opacity.subtle : 1,
          transform: [{ scale: pressed && !inactive && !flat ? PRESSED_SCALE : 1 }],
        },
        l.border ? { borderColor: colors[l.border], borderWidth: borderWidth.thin } : null,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors[l.foreground]} accessibilityElementsHidden />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size="sm" color={l.foreground} /> : null}
          <Text variant={compact ? 'captionStrong' : 'headline'} color={l.foreground} style={styles.label}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** A round button with only an icon (its label is for screen readers). */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'subtle',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'subtle' | 'plain';
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.icon,
        {
          backgroundColor: tone === 'subtle' ? colors.surface : 'transparent',
          borderColor: tone === 'subtle' ? colors.border : 'transparent',
          opacity: pressed ? opacity.pressed : 1,
          transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
        },
      ]}>
      <Icon name={icon} size="md" color="textPrimary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regular: { minHeight: 52, paddingHorizontal: spacing.xl },
  compact: { paddingHorizontal: spacing.lg, borderRadius: radius.md },
  flat: { paddingHorizontal: spacing.sm, alignSelf: 'flex-start' },
  block: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { textAlign: 'center' },
  icon: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: borderWidth.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
