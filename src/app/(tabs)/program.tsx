import { useTranslation } from 'react-i18next';

import { Banner, LoadingScreen, Rationale, Screen, Text } from '@/components/ui';
import { ProgramDay } from '@/features/program/ProgramDay';
import { ProgramVersionCard } from '@/features/program/ProgramVersionCard';
import { useProgramWeek } from '@/features/program/useProgramWeek';
import { usePlan } from '@/hooks/usePlan';

/** "Ton programme" (W-6): the week as planned and lived; the screen renders its view model only. */
export default function ProgramScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  const week = useProgramWeek(plan);
  if (!plan || !week) return <LoadingScreen />;

  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t('program.title')}
      </Text>
      {week.lightWeek ? <Banner tone="primary" message={t('program.adapted.light_week')} /> : null}
      {plan.schedule.warnings.map((w) => (
        <Banner key={w} message={t(`program.warnings.${w}`)} />
      ))}
      <ProgramVersionCard version={week.version} />
      {week.days.map((day) => (
        <ProgramDay key={day.date} day={day} />
      ))}
      <Rationale data={plan.workoutPlan.rationale} />
      <Rationale data={plan.schedule.rationale} />
    </Screen>
  );
}
