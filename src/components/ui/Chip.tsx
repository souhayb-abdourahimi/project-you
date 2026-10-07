import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, borderWidth, radius, spacing, useColors, type ColorToken } from '@/theme';

import { Icon, type IconName } from './Icon';

import { Text } from './Text';

/**
 * A selectable chip. `radio` for one choice among several (a scale, a reason), `checkbox` for a
 * multiple choice. The selected state is announced on native (accessibilityState) and on web
 * (aria-checked).
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'checkbox',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'radio';
}) {
  const colors = useColors();
  return (
    <Pressable
      role={role}
      aria-checked={selected}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.primary : colors.borderStrong,
          backgroundColor: selected ? colors.primarySubtle : colors.surface,
        },
      ]}>
      <Text variant="captionStrong" color={selected ? 'primary' : 'textPrimary'}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Single or multiple choice list rendered as chips. `single`: a radio group (one value, announced
 * as such, with its label); otherwise checkboxes.
 */
export function ChoiceGroup<T extends string | number>({
  options,
  selected,
  onToggle,
  single,
  label,
}: {
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  single?: boolean;
  /** Name of the group for screen readers (required in practice for a radio group). */
  label?: string;
}) {
  return (
    <View
      style={styles.group}
      role={single ? 'radiogroup' : undefined}
      accessibilityRole={single ? 'radiogroup' : undefined}
      accessibilityLabel={label}>
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          role={single ? 'radio' : 'checkbox'}
          selected={selected.includes(o.value)}
          onPress={() => onToggle(o.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
});

export type BadgeTone = 'neutral' | 'primary' | 'positive' | 'caution' | 'onDark';

const BADGE: Record<BadgeTone, { background: ColorToken; foreground: ColorToken }> = {
  neutral: { background: 'surfaceSubtle', foreground: 'textSecondary' },
  primary: { background: 'primarySubtle', foreground: 'primary' },
  positive: { background: 'successSubtle', foreground: 'success' },
  caution: { background: 'warningSubtle', foreground: 'warning' },
  onDark: { background: 'inverseFill', foreground: 'onInverse' },
};

/**
 * A status chip (duration, state, difficulty): information, never a button. A missed session is
 * `neutral`, never red (no-guilt design).
 */
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: IconName }) {
  const colors = useColors();
  const look = BADGE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[look.background] }]}>
      {icon ? <Icon name={icon} size={14} color={look.foreground} /> : null}
      <Text variant="captionStrong" color={look.foreground}>
        {label}
      </Text>
    </View>
  );
}
