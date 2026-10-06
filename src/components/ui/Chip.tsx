import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

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
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.surfaceMuted : colors.surface,
        },
      ]}>
      <Text variant="label" color={selected ? 'primary' : 'text'}>
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
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
