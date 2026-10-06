import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, Rationale, Row, Screen, Text } from '@/components/ui';
import { adaptationOfDay, structureFor } from '@/domain/training/structure';
import { usePlan } from '@/hooks/usePlan';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';

export default function ProgramScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const completed = useDataStore((s) => s.completedSessions);
  const adjustments = useDataStore((s) => s.adjustments);
  // Structural changes the user accepted, in force on each day (W-5): said, never hidden.
  const structureOf = useMemo(
    () => structureFor(adjustments, useDataStore.getState(), completed),
    [adjustments, completed],
  );
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
        const adapted =
          workout?.kind === 'workout'
            ? adaptationOfDay(
                adjustments,
                plan.prescription(day.date, workout.sessionIndex)?.adjustmentId,
                structureOf(day.date),
              )
            : null;
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
                {adapted ? <Text color="primary">{t(`program.adapted.${adapted}`)}</Text> : null}
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
