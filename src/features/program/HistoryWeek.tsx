import { useTranslation } from 'react-i18next';

import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { spacing, useColors } from '@/theme';
import { formatDate } from '@/lib/format';

import { DecisionRow } from './DecisionRow';
import { SessionFacts } from './SessionFacts';
import type { HistoryWeekView } from './useTrainingHistory';
import { WeekFacts } from './WeekFacts';

/** One week of the history: facts, sessions, program versions, answers to proposals. */
export function HistoryWeek({ week }: { week: HistoryWeekView }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  return (
    <Card raised={week.current} style={styles.card}>
      <Text variant="title3" accessibilityRole="header">
        {week.current
          ? t('history.thisWeek')
          : t('history.weekOf', { date: formatDate(week.weekStart, i18n.language) })}
      </Text>
      <WeekFacts totals={week.totals} current={week.current} />
      {week.versions.map((v) => (
        <Badge
          key={v.version}
          tone="primary"
          icon="program"
          label={`${t('history.version', { version: v.version })} · ${t(v.key)}`}
        />
      ))}
      {week.sessions.map((s) => (
        <View key={s.key} style={[styles.divided, { borderTopColor: colors.border }]}>
          <SessionFacts session={s} />
        </View>
      ))}
      {week.decisions.length > 0 ? (
        <Text variant="captionStrong" color="textMuted" style={[styles.divided, { borderTopColor: colors.border }]}>
          {t('history.decisions')}
        </Text>
      ) : null}
      {week.decisions.map((e) => (
        <DecisionRow key={e.decision.id} entry={e} />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
});
