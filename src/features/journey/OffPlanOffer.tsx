import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, Text } from '@/components/ui';
import type { CoachDay } from '@/domain/journey/coach';

/**
 * A rest day with nothing else to say (W-6): a session off plan stays possible, offered discreetly.
 * Never an item of the day, never a catch-up; the coach of the day decides when it is offered.
 */
export function OffPlanOffer({ coach }: { coach: CoachDay }) {
  const { t } = useTranslation();
  if (!coach.offPlan) return null;
  return (
    <Card muted>
      <Text color="textSecondary">{t('daily.offPlan.body')}</Text>
      <Button
        compact
        variant="ghost"
        label={t('daily.offPlan.cta')}
        onPress={() => router.push(`/workout/${coach.date}`)}
      />
    </Card>
  );
}
