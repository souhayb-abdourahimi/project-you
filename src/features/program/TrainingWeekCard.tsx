import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { StyleSheet, View } from 'react-native';

import { Button, Card, ProgressBar, Section, Text } from '@/components/ui';
import { spacing } from '@/theme';
import type { WeekComparison } from '@/domain/training/compare';

import { WeekFacts } from './WeekFacts';

/** Progress Journey (W-6): this week's training, planned vs done, and the way to the history. */
export function TrainingWeekCard({ week }: { week: WeekComparison }) {
  const { t } = useTranslation();
  const { sessions: _s, weekStart: _w, ...totals } = week;
  if (totals.planned === 0 && totals.extra === 0) return null;
  return (
    <Section title={t('history.thisWeek')}>
      <Card style={styles.card}>
        {totals.planned > 0 ? (
          <View style={styles.head} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.value}>
              <Text variant="metric">{totals.done + totals.adapted}</Text>
              <Text variant="captionStrong" color="textMuted">
                / {totals.planned} {t('today.glance.sessions')}
              </Text>
            </View>
            <ProgressBar
              value={(totals.done + totals.adapted) / totals.planned}
              label={t('today.glance.weekA11y', { done: totals.done + totals.adapted, planned: totals.planned })}
              color="success"
            />
          </View>
        ) : null}
        <WeekFacts totals={totals} current />
        <Button
          compact
          variant="tertiary"
          icon="history"
          label={t('history.open')}
          onPress={() => router.push('/history')}
        />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { gap: spacing.sm },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
});
