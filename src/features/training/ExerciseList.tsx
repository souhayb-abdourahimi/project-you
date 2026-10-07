import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { getExercise } from '@/domain/training/exercises';
import type { LoggedSet } from '@/domain/training/progression';
import { exerciseStatus, type ExerciseReport, type SessionExercise } from '@/domain/training/session';
import { MIN_TOUCH, radius, spacing, useColors, type ColorToken } from '@/theme';

const MARK: Record<string, { icon: IconName; color: ColorToken }> = {
  pending: { icon: 'todo', color: 'textMuted' },
  in_progress: { icon: 'partial', color: 'primary' },
  done: { icon: 'done', color: 'success' },
  not_performed: { icon: 'skipped', color: 'textMuted' },
};

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
      <Text variant="title3">{t('workout.list')}</Text>
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                {
                  backgroundColor:
                    i === current ? colors.primarySubtle : pressed ? colors.surfaceSubtle : 'transparent',
                },
              ]}>
              <Text variant="captionStrong" color={i === current ? 'primary' : 'textMuted'} style={styles.index}>
                {i + 1}
              </Text>
              <Text
                style={styles.name}
                variant={i === current ? 'bodyMedium' : 'body'}
                color={status === 'not_performed' ? 'textMuted' : 'textPrimary'}>
                {name}
              </Text>
              <Text variant="caption" color="textMuted">
                {label}
              </Text>
              <Icon name={MARK[status].icon} size="sm" color={MARK[status].color} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    minHeight: MIN_TOUCH + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  index: { width: 16, textAlign: 'center' },
  name: { flex: 1 },
});
