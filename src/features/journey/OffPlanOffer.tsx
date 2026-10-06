import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, Text } from '@/components/ui';
import type { DailyPlan } from '@/domain/journey/daily-plan';

/**
 * A rest day with nothing else to say (W-6): a session off plan stays possible, offered discreetly.
 * Never an item of the day, never a catch-up; the Daily Coach decides when it is offered.
 */
export function OffPlanOffer({ daily }: { daily: DailyPlan }) {
  const { t } = useTranslation();
  if (!daily.offPlan) return null;
  return (
    <Card muted>
      <Text variant="caption" color="textMuted">
        {t('daily.offPlan.body')}
      </Text>
      <Button
        compact
        variant="ghost"
        label={t('daily.offPlan.cta')}
        onPress={() => router.push(`/workout/${daily.date}`)}
      />
    </Card>
  );
}
