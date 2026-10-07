import { useTranslation } from 'react-i18next';

import { Button, Card, Row, Text } from '@/components/ui';
import { shortDayMemory } from '@/domain/journey/coach-memory';
import { toIsoDate } from '@/domain/shared/dates';
import { useDataStore } from '@/state/data';

import { useCoachAnswer } from './useCoachAnswer';
import { useSay } from './useSay';

/**
 * "Ce que le coach retient" (W-7 §10): only what the user confirmed, visible, and forgotten in one
 * tap. Forgetting is a new row of the journal (synced, exported, deleted with the account).
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
        return (
          <Row key={m.weekday}>
            <Text style={{ flex: 1 }}>{label}</Text>
            <Button
              compact
              variant="ghost"
              label={t('coachDay.memory.forget')}
              accessibilityLabel={t('coachDay.memory.forgetA11y', { item: label })}
              onPress={() => forget(m)}
            />
          </Row>
        );
      })}
    </Card>
  );
}
