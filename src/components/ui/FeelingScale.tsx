import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, borderWidth, radius, spacing, useColors } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

/** Visual step of an option, from the lightest (1) to the hardest (5). */
export type FeelingStep = 1 | 2 | 3 | 4 | 5;

const ICON = { 1: 'mood1', 2: 'mood2', 3: 'mood3', 4: 'mood4', 5: 'mood5' } as const;

/**
 * A five-step feeling scale (W-10 reference: "Comment était cette séance ?"): round marks with a
 * small label under each. A radio group; the selected step is filled and bold, never only
 * coloured. No step is red: a hard session or week is information, not a failure.
 */
export function FeelingScale<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; step: FeelingStep }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <View role="radiogroup" accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            role="radio"
            aria-checked={selected}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={styles.option}>
            <View
              style={[
                styles.mark,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.borderStrong,
                },
              ]}>
              <Icon name={ICON[option.step]} size="lg" color={selected ? 'onPrimary' : 'textSecondary'} />
            </View>
            <Text variant="micro" color={selected ? 'primary' : 'textMuted'} numberOfLines={2} style={styles.label}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  option: { flex: 1, alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH },
  mark: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { textAlign: 'center' },
});
