import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ExerciseStatus } from '@/domain/training/session';
import { radius, spacing, useColors, type ColorToken } from '@/theme';

const LOOK: Record<ExerciseStatus, ColorToken> = {
  done: 'success',
  in_progress: 'primary',
  pending: 'surfaceSubtle',
  not_performed: 'borderStrong',
};

/**
 * Where the session stands, one segment per exercise: done in green, the current one in blue
 * (outlined until a set is logged), skipped in grey, the rest empty. Read as one sentence.
 */
export function SessionSteps({ statuses, current }: { statuses: readonly ExerciseStatus[]; current: number }) {
  const { t } = useTranslation();
  const colors = useColors();
  const done = statuses.filter((s) => s === 'done').length;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('workout.steps.a11y', { done, total: statuses.length, current: current + 1 })}
      accessibilityValue={{ min: 0, max: statuses.length, now: done }}
      style={styles.row}>
      {statuses.map((status, i) => {
        const isCurrent = i === current && status !== 'done' && status !== 'not_performed';
        return (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: colors[isCurrent && status === 'pending' ? 'primarySubtle' : LOOK[status]] },
              isCurrent && { borderColor: colors.primary, borderWidth: 1.5 },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  segment: { flex: 1, height: 6, borderRadius: radius.pill },
});
