import { useTranslation } from 'react-i18next';

import { Card, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';

import { DecisionRow } from './DecisionRow';
import { SessionFacts } from './SessionFacts';
import type { HistoryWeekView } from './useTrainingHistory';
import { WeekFacts } from './WeekFacts';

/** One week of the history: facts, sessions, program versions, answers to proposals. */
export function HistoryWeek({ week }: { week: HistoryWeekView }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <Text variant="heading" accessibilityRole="header">
        {week.current
          ? t('history.thisWeek')
          : t('history.weekOf', { date: formatDate(week.weekStart, i18n.language) })}
      </Text>
      <WeekFacts totals={week.totals} current={week.current} />
      {week.versions.map((v) => (
        <Text key={v.version} color="primary">
          {t('history.version', { version: v.version })} · {t(v.key)}
        </Text>
      ))}
      {week.sessions.map((s) => (
        <SessionFacts key={s.key} session={s} />
      ))}
      {week.decisions.length > 0 ? (
        <Text variant="label" color="textMuted">
          {t('history.decisions')}
        </Text>
      ) : null}
      {week.decisions.map((e) => (
        <DecisionRow key={e.decision.id} entry={e} />
      ))}
    </Card>
  );
}
