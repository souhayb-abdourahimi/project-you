import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Banner, Card, LoadingScreen, Rationale, Screen, ScreenHeader, Section } from '@/components/ui';
import { ProgramDayCard, WeekDayRow } from '@/features/program/ProgramDay';
import { ProgramVersionCard } from '@/features/program/ProgramVersionCard';
import { useProgramWeek } from '@/features/program/useProgramWeek';
import { WeekStrip } from '@/features/program/WeekStrip';
import { usePlan } from '@/hooks/usePlan';
import { radius, spacing, useColors } from '@/theme';

/**
 * "Ton programme" (W-6, W-10 layout): the week as a strip, the selected day in detail (today by
 * default), then the training days of the week as rows. Renders its view model only.
 */
export default function ProgramScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const plan = usePlan();
  const week = useProgramWeek(plan);
  const [picked, setPicked] = useState<string | null>(null);
  if (!plan || !week) return <LoadingScreen />;

  const fallback = week.days.find((d) => d.when === 'today') ?? week.days[0];
  const selected = week.days.find((d) => d.date === picked) ?? fallback;
  const training = week.days.filter((d) => d.sessions.length > 0);

  return (
    <Screen airy>
      <View style={styles.top}>
        <ScreenHeader title={t('program.title')} />
        {selected ? <WeekStrip days={week.days} selected={selected.date} onSelect={setPicked} /> : null}
      </View>
      {week.lightWeek ? <Banner tone="primary" message={t('program.adapted.light_week')} /> : null}
      {plan.schedule.warnings.map((w) => (
        <Banner key={w} message={t(`program.warnings.${w}`)} />
      ))}
      {selected ? <ProgramDayCard day={selected} /> : null}

      {training.length > 0 ? (
        <Section title={t('program.week')}>
          <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {training.map((day, i) => (
              <View key={day.date} style={i > 0 ? [styles.divider, { borderTopColor: colors.border }] : null}>
                <WeekDayRow day={day} selected={day.date === selected?.date} onPress={() => setPicked(day.date)} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <ProgramVersionCard version={week.version} />
      <Card tone="subtle" dense>
        <Rationale data={plan.workoutPlan.rationale} label={t('program.whySessions')} />
        <Rationale data={plan.schedule.rationale} label={t('program.whySchedule')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.md },
  list: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
