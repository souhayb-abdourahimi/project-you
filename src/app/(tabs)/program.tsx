import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, Rationale, Row, Screen, Text } from '@/components/ui';
import { usePlan } from '@/hooks/usePlan';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';

export default function ProgramScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const completed = useDataStore((s) => s.completedSessions);
  if (!plan) return null;

  return (
    <Screen>
      <Text variant="display">{t('program.title')}</Text>
      {plan.schedule.warnings.map((w) => (
        <Banner key={w} message={t(`program.warnings.${w}`)} />
      ))}
      {plan.schedule.days.map((day) => {
        const workout = day.items.find((i) => i.kind === 'workout');
        const session = workout?.kind === 'workout' ? plan.sessionTemplate(day.date, workout.sessionIndex) : null;
        const done = completed.some((c) => c.date === day.date);
        return (
          <Card key={day.date} muted={!workout}>
            <Text variant="caption" color="textMuted">
              {formatDate(day.date, i18n.language)}
            </Text>
            {workout?.kind === 'workout' && session ? (
              <>
                <Text variant="heading">
                  {t(`enums.focus.${session.focus}`)} {workout.variant === 'short' ? `· ${t('workout.short')}` : ''}
                </Text>
                <Text color="textMuted">
                  {workout.start ? `${workout.start}–${workout.end} · ` : ''}
                  {t(`enums.location.${workout.location}`)} ·{' '}
                  {t('program.exercises', { count: session.exercises.length })} ·{' '}
                  {t('program.estimated', { count: session.estimatedMinutes })}
                </Text>
                {done ? (
                  <Text color="success">{t('common.done')}</Text>
                ) : (
                  <Row>
                    <Button compact label={t('program.open')} onPress={() => router.push(`/workout/${day.date}`)} />
                  </Row>
                )}
              </>
            ) : (
              <Text>{t('program.rest')}</Text>
            )}
          </Card>
        );
      })}
      <Rationale data={plan.workoutPlan.rationale} />
      <Rationale data={plan.schedule.rationale} />
    </Screen>
  );
}
