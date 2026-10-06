import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui';

import type { HistoryWeekView } from './useTrainingHistory';

/**
 * A week of training in facts (W-6, D-038): sessions done out of those planned (adapted ones
 * count, said positively), sets of the sessions done, extra sessions, sessions still ahead.
 */
export function WeekFacts({ totals, current }: { totals: HistoryWeekView['totals']; current: boolean }) {
  const { t } = useTranslation();
  const prefix = current ? 'history.week.current' : 'history.week.past';
  const reached = totals.done + totals.adapted;
  return (
    <View>
      {totals.planned > 0 ? (
        <Text>
          {t(
            reached >= totals.planned
              ? `${prefix}.all`
              : totals.adapted > 0
                ? `${prefix}.withAdapted`
                : `${prefix}.sessions`,
            { done: reached, planned: totals.planned, adapted: totals.adapted },
          )}
        </Text>
      ) : null}
      {totals.setsPlanned > 0 ? (
        <Text color="textMuted">{t('history.week.sets', { done: totals.setsDone, planned: totals.setsPlanned })}</Text>
      ) : null}
      {totals.extra > 0 ? <Text color="textMuted">{t('history.week.extra', { count: totals.extra })}</Text> : null}
      {current && totals.ahead > 0 ? (
        <Text color="textMuted">{t('history.week.ahead', { count: totals.ahead })}</Text>
      ) : null}
    </View>
  );
}
