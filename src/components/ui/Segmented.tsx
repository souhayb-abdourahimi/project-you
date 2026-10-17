import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { Text } from './Text';

/**
 * A compact segmented control (W-10 reference: 4 sem. · 12 sem. · 6 mois · 1 an): one value among a
 * few, in a quiet track, the active one filled in blue. A radio group for screen readers.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <View
      role="radiogroup"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surfaceSubtle }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}>
            <Text variant="captionStrong" color={selected ? 'onPrimary' : 'textSecondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: spacing.xxs + 1, gap: spacing.xxs },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - spacing.xs,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
