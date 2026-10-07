import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { getExercise } from '@/domain/training/exercises';
import type { LoggedSet } from '@/domain/training/progression';
import { exerciseStatus, type ExerciseReport, type SessionExercise } from '@/domain/training/session';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

const MARK = { pending: '○', in_progress: '◐', done: '✓', not_performed: '–' } as const;

/** The whole session at a glance; any exercise can be opened (order is a suggestion). */
export function ExerciseList({
  exercises,
  sets,
  reports,
  current,
  onOpen,
}: {
  exercises: readonly SessionExercise[];
  sets: Record<string, LoggedSet[]>;
  reports: Record<string, ExerciseReport>;
  current: number;
  onOpen: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const colors = useColors();
  return (
    <View style={styles.root}>
      <Text variant="label" color="textMuted">
        {t('workout.list')}
      </Text>
      {exercises.map((e, i) => {
        const done = sets[e.exerciseId] ?? [];
        const status = exerciseStatus(e, done, reports[e.prescribedId]);
        const name = getExercise(e.exerciseId)?.name[lang] ?? e.exerciseId;
        const label =
          status === 'in_progress'
            ? t('workout.status.in_progress', { done: done.length, total: e.sets })
            : t(`workout.status.${status}`);
        return (
          <Pressable
            key={e.prescribedId}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${label}`}
            accessibilityHint={t('workout.goTo', { name })}
            accessibilityState={{ selected: i === current }}
            onPress={() => onOpen(i)}
            style={[
              styles.row,
              {
                borderColor: i === current ? colors.primary : colors.border,
                backgroundColor: i === current ? colors.surfaceMuted : colors.surface,
              },
            ]}>
            <Text color={status === 'done' ? 'success' : 'textMuted'}>{MARK[status]}</Text>
            <Text style={styles.name} color={status === 'not_performed' ? 'textMuted' : 'text'}>
              {name}
            </Text>
            <Text variant="caption" color="textMuted">
              {label}
            </Text>
          </Pressable>
        );
      })}
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
  name: { flex: 1 },
});
