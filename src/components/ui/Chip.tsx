import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { Text } from './Text';

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      // role/aria-* reach the DOM on web (aria-checked); accessibilityState covers native readers.
      role="checkbox"
      aria-checked={selected}
      accessibilityRole="checkbox"
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

/** Single or multiple choice list rendered as chips. */
export function ChoiceGroup<T extends string | number>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.group}>
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
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
