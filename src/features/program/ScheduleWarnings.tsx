import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Notice } from '@/components/ui';
import type { PlanningWarning } from '@/domain/planning/engine';
import { spacing } from '@/theme';

/** Warnings that the user can act on: what does not fit is said, with where to change it. */
const ACTIONABLE: readonly PlanningWarning[] = ['no_free_slot', 'fewer_sessions_than_requested'];

/**
 * The planner's warnings for the week. When sessions do not fit, no hour is invented: the screen
 * says so and opens the availability or the session length (moving a placed session stays on its card).
 */
export function ScheduleWarnings({ warnings }: { warnings: readonly PlanningWarning[] }) {
  const { t } = useTranslation();
  return (
    <>
      {warnings.map((w) =>
        ACTIONABLE.includes(w) ? (
          <Notice key={w} tone="info" message={t(`program.warnings.${w}`)}>
            <View style={styles.actions}>
              <Button
                compact
                variant="secondary"
                label={t('calendar.editAvailability')}
                onPress={() => router.push('/settings/schedule')}
              />
              <Button
                compact
                variant="secondary"
                label={t('program.changeDuration')}
                onPress={() => router.push('/settings/training')}
              />
            </View>
          </Notice>
        ) : (
          <Banner key={w} message={t(`program.warnings.${w}`)} />
        ),
      )}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
