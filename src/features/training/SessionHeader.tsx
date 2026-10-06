import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ProgressBar, Text } from '@/components/ui';
import type { SessionProgress } from '@/domain/training/session';
import { spacing } from '@/theme';

import type { WorkoutSessionView } from './useWorkoutSession';

/** Session name, goal, duration as prescribed, and how far along the session is. */
export function SessionHeader({ view, progress }: { view: WorkoutSessionView; progress: SessionProgress }) {
  const { t } = useTranslation();
  const ratio = progress.setsPlanned > 0 ? progress.setsDone / progress.setsPlanned : 0;
  const progressLabel = t('workout.header.progress', { done: progress.setsDone, total: progress.setsPlanned });
  return (
    <View style={styles.root}>
      <Text variant="title">{t(`enums.focus.${view.focus}`)}</Text>
      <View style={styles.meta}>
        <Text variant="label" color={view.variant === 'full' ? 'textMuted' : 'primary'}>
          {t(`workout.${view.variant}`)}
        </Text>
        <Text variant="label" color="textMuted">
          {t('workout.header.minutes', { count: view.minutes })}
        </Text>
        {view.purpose ? (
          <Text variant="label" color="textMuted">
            {t('workout.header.purpose', { purpose: t(`workout.purposes.${view.purpose}`) })}
          </Text>
        ) : null}
      </View>
      {view.variant !== 'full' ? <Text color="textMuted">{t(`workout.variantNote.${view.variant}`)}</Text> : null}
      {view.offPlan ? <Text color="textMuted">{t('workout.offPlan')}</Text> : null}
      <ProgressBar value={ratio} label={progressLabel} />
      <Text variant="caption" color="textMuted">
        {progressLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
});
