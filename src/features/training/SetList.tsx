import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import type { LoggedSet } from '@/domain/training/progression';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

import { setValue } from './format';

/** Sets done today ("Réalisé"), each one correctable with a tap. */
export function SetList({
  sets,
  editing,
  onEdit,
}: {
  sets: readonly LoggedSet[];
  editing: number | null;
  onEdit: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  if (sets.length === 0) return null;
  return (
    <View style={styles.root}>
      {sets.map((s, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={`${t('workout.setDone', { index: i + 1, value: setValue(t, i18n.language, s) })}. ${t('workout.correct', { index: i + 1 })}`}
          accessibilityState={{ selected: editing === i }}
          onPress={() => onEdit(i)}
          style={[
            styles.row,
            { borderColor: editing === i ? colors.primary : colors.border, backgroundColor: colors.surface },
          ]}>
          <Text color="success">✓</Text>
          <Text style={styles.value}>
            {t('workout.setDone', { index: i + 1, value: setValue(t, i18n.language, s) })}
          </Text>
          <Text variant="caption" color="primary">
            {t('workout.correct', { index: i + 1 })}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  value: { flex: 1 },
});
