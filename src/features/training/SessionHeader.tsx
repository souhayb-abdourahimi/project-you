import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Icon, ProgressBar, Text } from '@/components/ui';
import type { SessionProgress } from '@/domain/training/session';
import { spacing } from '@/theme';

import type { WorkoutSessionView } from './useWorkoutSession';

/**
 * The session's graphite header (W-9 §4): name, the prescribed facts as chips, and how far along
 * it is. Facts only: the duration is the prescription's, never a measured or estimated value.
 */
export function SessionHeader({ view, progress }: { view: WorkoutSessionView; progress: SessionProgress }) {
  const { t } = useTranslation();
  const ratio = progress.setsPlanned > 0 ? progress.setsDone / progress.setsPlanned : 0;
  const progressLabel = t('workout.header.progress', { done: progress.setsDone, total: progress.setsPlanned });
  return (
    <Card tone="inverse" raised style={styles.root}>
      <View style={styles.overline}>
        <Icon name="workout" size="sm" color="onInverseMuted" />
        <Text variant="overline" color="onInverseMuted">
          {t(`workout.${view.variant}`)}
        </Text>
      </View>
      <Text variant="title1" color="onInverse">
        {t(`enums.focus.${view.focus}`)}
      </Text>
      <View style={styles.meta}>
        <Badge tone="onDark" icon="time" label={t('workout.header.minutes', { count: view.minutes })} />
        {view.purpose ? (
          <Badge
            tone="onDark"
            label={t('workout.header.purpose', { purpose: t(`workout.purposes.${view.purpose}`) })}
          />
        ) : null}
      </View>
      {view.variant !== 'full' ? <Text color="onInverseMuted">{t(`workout.variantNote.${view.variant}`)}</Text> : null}
      {view.offPlan ? <Text color="onInverseMuted">{t('workout.offPlan')}</Text> : null}
      <View style={styles.progress}>
        <ProgressBar value={ratio} label={progressLabel} track="inverseFill" />
        <Text variant="captionStrong" color="onInverseMuted">
          {progressLabel}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  overline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  progress: { gap: spacing.xs, marginTop: spacing.sm },
});
