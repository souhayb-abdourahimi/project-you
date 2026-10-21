import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { Text } from './Text';

/**
 * One choice among a short list, as iOS-like rows with a radio mark (W-10 reference: "Pourquoi tu
 * veux le remplacer ?"). Announced as a radio group; the selected row is tinted, not only coloured.
 */
export function RadioList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <View
      role="radiogroup"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Fragment key={option.value}>
            {i > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
            <Pressable
              role="radio"
              aria-checked={selected}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: selected ? colors.primarySubtle : pressed ? colors.surfaceSubtle : 'transparent' },
              ]}>
              <View style={[styles.mark, { borderColor: selected ? colors.primary : colors.borderStrong }]}>
                {selected ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
              </View>
              <Text variant={selected ? 'bodyMedium' : 'body'} style={styles.flex}>
                {option.label}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing['2xl'] + spacing.sm },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  mark: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  flex: { flex: 1 },
});
