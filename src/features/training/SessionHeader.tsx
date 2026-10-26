import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Icon, Text } from '@/components/ui';
import type { ExerciseStatus, SessionProgress } from '@/domain/training/session';

import { SessionSteps } from './SessionSteps';
import { spacing } from '@/theme';

import type { WorkoutSessionView } from './useWorkoutSession';

/**
 * The session's header (W-9 §4, light since W-10): name, the prescribed facts as chips, and how far along
 * it is. Facts only: the duration is the prescription's, never a measured or estimated value.
 */
export function SessionHeader({
  view,
  progress,
  statuses,
  current,
}: {
  view: WorkoutSessionView;
  progress: SessionProgress;
  statuses: readonly ExerciseStatus[];
  current: number;
}) {
  const { t } = useTranslation();
  const progressLabel = t('workout.header.progress', { done: progress.setsDone, total: progress.setsPlanned });
  return (
    <View style={styles.root}>
      <View style={styles.overline}>
        <Icon name="workout" size="sm" color="training" />
        <Text variant="overline" color="textSecondary">
          {t(`workout.${view.variant}`)}
        </Text>
      </View>
      <Text variant="title1">{t(`enums.focus.${view.focus}`)}</Text>
      <View style={styles.meta}>
        <Badge icon="time" label={t('workout.header.minutes', { count: view.minutes })} />
        {view.purpose ? (
          <Badge label={t('workout.header.purpose', { purpose: t(`workout.purposes.${view.purpose}`) })} />
        ) : null}
      </View>
      {view.variant !== 'full' ? <Text color="textSecondary">{t(`workout.variantNote.${view.variant}`)}</Text> : null}
      {view.offPlan ? <Text color="textSecondary">{t('workout.offPlan')}</Text> : null}
      <View style={styles.progress}>
        <SessionSteps statuses={statuses} current={current} />
        <Text variant="captionStrong" color="textMuted">
          {progressLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  overline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  progress: { gap: spacing.sm, marginTop: spacing.xs },
});
