import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, borderWidth, radius, spacing, useColors } from '@/theme';

import { Text } from './Text';

/**
 * Underlined segmented tabs (W-10 reference: Jour / Semaine / Recettes). One row, equal widths,
 * the active tab in the primary colour with a short bar under it. Announced as a tab list; every
 * tab is ≥ 44 pt high.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Name of the tab list for screen readers. */
  label: string;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.row, { borderBottomColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => onChange(option.value)}
            style={styles.tab}>
            <Text variant={selected ? 'captionStrong' : 'caption'} color={selected ? 'primary' : 'textSecondary'}>
              {option.label}
            </Text>
            <View style={[styles.bar, { backgroundColor: selected ? colors.primary : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  bar: {
    height: borderWidth.strong * 2,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
});
