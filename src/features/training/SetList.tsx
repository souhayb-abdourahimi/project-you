import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LoggedSet } from '@/domain/training/progression';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { setValue } from './format';

/**
 * The sets of the exercise as a table (W-10 reference): the sets done today, each one correctable
 * with a tap, then the set in progress and the ones still planned. Only logged sets carry values;
 * a planned set shows no number (nothing is pre-filled as if it were done).
 */
export function SetList({
  sets,
  planned,
  editing,
  onEdit,
}: {
  sets: readonly LoggedSet[];
  /** Sets prescribed for the exercise. */
  planned: number;
  editing: number | null;
  onEdit: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const rows = Math.max(planned, sets.length);
  return (
    <View style={[styles.root, { borderColor: colors.border }]}>
      {Array.from({ length: rows }, (_, i) => {
        const set = sets[i];
        const divider = i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null;
        if (set) {
          const done = t('workout.setDone', { index: i + 1, value: setValue(t, i18n.language, set) });
          const selected = editing === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${done}. ${t('workout.correct', { index: i + 1 })}`}
              accessibilityState={{ selected }}
              onPress={() => onEdit(i)}
              style={({ pressed }) => [
                styles.row,
                divider,
                { backgroundColor: selected ? colors.primarySubtle : pressed ? colors.surfaceSubtle : 'transparent' },
              ]}>
              <Text style={styles.value} variant="bodyMedium">
                {done}
              </Text>
              <Text variant="caption" color="primary">
                {t('workout.correct', { index: i + 1 })}
              </Text>
              <View style={[styles.check, { backgroundColor: colors.success }]}>
                <Icon name="check" size={12} color="surface" />
              </View>
            </Pressable>
          );
        }
        const current = i === sets.length;
        return (
          <View key={i} style={[styles.row, divider]}>
            <Text
              style={styles.value}
              color={current ? 'primary' : 'textMuted'}
              variant={current ? 'bodyMedium' : 'body'}>
              {current
                ? t('workout.facts.setCurrent', { index: i + 1 })
                : t('workout.facts.setPending', { index: i + 1 })}
            </Text>
            <View style={[styles.pending, { borderColor: current ? colors.primary : colors.borderStrong }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  value: { flex: 1 },
  check: { width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pending: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 1.5 },
});
