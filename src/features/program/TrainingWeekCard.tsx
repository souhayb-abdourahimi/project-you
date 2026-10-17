import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, ProgressBar, Section, Text } from '@/components/ui';
import { spacing } from '@/theme';
import type { WeekComparison } from '@/domain/training/compare';

import { WeekFacts } from './WeekFacts';

/**
 * Progress Journey (W-6): this week's training, planned vs done, and the way to the history. The
 * figure and its bar lead; the counted facts follow as chips; the full sentences are one tap away.
 */
export function TrainingWeekCard({ week }: { week: WeekComparison }) {
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);
  const { sessions: _s, weekStart: _w, ...totals } = week;
  if (totals.planned === 0 && totals.extra === 0) return null;
  const reached = totals.done + totals.adapted;
  const chips = [
    totals.setsPlanned > 0 ? t('history.week.chipSets', { done: totals.setsDone, planned: totals.setsPlanned }) : null,
    totals.ahead > 0 ? t('history.week.chipAhead', { count: totals.ahead }) : null,
    totals.extra > 0 ? t('history.week.chipExtra', { count: totals.extra }) : null,
  ].filter((c): c is string => c !== null);
  return (
    <Section title={t('history.thisWeek')}>
      <Card style={styles.card}>
        {totals.planned > 0 ? (
          <View style={styles.head}>
            {/* Read through the bar's label; the big figure is the same fact. */}
            <View style={styles.value} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text variant="metric">{reached}</Text>
              <Text variant="captionStrong" color="textMuted">
                / {totals.planned} {t('today.glance.sessions')}
              </Text>
            </View>
            <ProgressBar
              value={reached / totals.planned}
              label={t('today.glance.weekA11y', { done: reached, planned: totals.planned })}
              color="success"
            />
          </View>
        ) : null}
        {chips.length > 0 ? (
          <View style={styles.chips} accessible accessibilityLabel={chips.join(', ')}>
            {chips.map((c) => (
              <Badge key={c} label={c} />
            ))}
          </View>
        ) : null}
        {details ? <WeekFacts totals={totals} current /> : null}
        <View style={styles.actions}>
          <Button
            compact
            variant="ghost"
            label={t(details ? 'history.week.detailsHide' : 'history.week.details')}
            expanded={details}
            onPress={() => setDetails((d) => !d)}
          />
          <Button
            compact
            variant="ghost"
            icon="history"
            label={t('history.open')}
            onPress={() => router.push('/history')}
          />
        </View>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { gap: spacing.sm },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
});
