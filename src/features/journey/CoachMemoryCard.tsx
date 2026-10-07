import { useTranslation } from 'react-i18next';

import { Card, ConfirmButton, Text } from '@/components/ui';
import { shortDayMemory } from '@/domain/journey/coach-memory';
import { toIsoDate } from '@/domain/shared/dates';
import { useDataStore } from '@/state/data';

import { useCoachAnswer } from './useCoachAnswer';
import { useSay } from './useSay';

/**
 * "Ce que le coach retient" (W-7 §10, W-8 §6): only what the user confirmed, visible, and forgotten
 * after one confirmation. Forgetting is a new row of the journal (synced, exported, deleted with
 * the account). The legacy `coach_memory` table is not read (D-043).
 */
export function CoachMemoryCard() {
  const { t } = useTranslation();
  const say = useSay();
  const today = toIsoDate(new Date());
  const adjustments = useDataStore((s) => s.adjustments);
  const dayLogs = useDataStore((s) => s.dayLogs);
  const { forget } = useCoachAnswer(today);
  const { confirmed } = shortDayMemory({ today, dayLogs, adjustments });
  return (
    <Card>
      <Text variant="heading">{t('coachDay.memory.title')}</Text>
      <Text color="textMuted">{t(confirmed.length ? 'coachDay.memory.intro' : 'coachDay.memory.empty')}</Text>
      {confirmed.map((m) => {
        const label = say({
          key: 'coachDay.memory.short_day',
          params: { weekday: `coachDay.weekday.${m.weekday}`, date: m.since },
        });
        // What, why and since when (W-8 §6); forgetting asks once (§29), then is a journal row.
        return (
          <Card key={m.weekday} muted>
            <Text>{label}</Text>
            <Text variant="caption" color="textMuted">
              {t('coachDay.memory.why')}
            </Text>
            <ConfirmButton
              variant="ghost"
              label={t('coachDay.memory.forget')}
              accessibilityLabel={t('coachDay.memory.forgetA11y', { item: label })}
              message={t('coachDay.memory.forgetConfirm', { item: label })}
              confirmLabel={t('coachDay.memory.forgetYes')}
              onConfirm={() => forget(m)}
            />
          </Card>
        );
      })}
    </Card>
  );
}
