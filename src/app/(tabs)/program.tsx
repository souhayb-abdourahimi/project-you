import { useTranslation } from 'react-i18next';

import { Banner, Card, LoadingScreen, Rationale, Screen, ScreenHeader, Section } from '@/components/ui';
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
    <Screen airy>
      <ScreenHeader title={t('program.title')} />
      {week.lightWeek ? <Banner tone="primary" message={t('program.adapted.light_week')} /> : null}
      {plan.schedule.warnings.map((w) => (
        <Banner key={w} message={t(`program.warnings.${w}`)} />
      ))}
      <ProgramVersionCard version={week.version} />
      <Section title={t('program.week')}>
        {week.days.map((day) => (
          <ProgramDay key={day.date} day={day} />
        ))}
      </Section>
      <Card tone="subtle" dense>
        <Rationale data={plan.workoutPlan.rationale} label={t('program.whySessions')} />
        <Rationale data={plan.schedule.rationale} label={t('program.whySchedule')} />
      </Card>
    </Screen>
  );
}
