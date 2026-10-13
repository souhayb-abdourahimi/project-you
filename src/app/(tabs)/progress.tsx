import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, LoadingScreen, Screen, ScreenHeader, Section, Text } from '@/components/ui';
import type { ProgressSection } from '@/domain/journey/progress-journey';
import { Recommendations } from '@/features/journey/Recommendations';
import { TrainingWeekCard } from '@/features/program/TrainingWeekCard';
import { BodyProgress as Body } from '@/features/progress/BodyProgress';
import { Path } from '@/features/progress/Path';
import { Performance } from '@/features/progress/Performance';
import { RANGE_WEEKS, type ProgressRange } from '@/features/progress/view';
import { Habits, SinceStart } from '@/features/progress/SinceStart';
import { useJourney } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';
import { formatDate } from '@/lib/format';

/** "Mon évolution" (docs/PROGRESS_JOURNEY.md §2): the story since the start, only measured values. */
export default function ProgressScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  const [range, setRange] = useState<ProgressRange>('12w');
  const journey = useJourney(plan);
  if (!plan || !journey) return <LoadingScreen />;
  const { progress } = journey;
  const goal = plan.snapshot.goal.type;
  const date = (d: string) => formatDate(d, i18n.language);
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const rangeLabels =
    lang === 'fr'
      ? { '4w': '4 sem.', '12w': '12 sem.', '6m': '6 mois', '1y': '1 an' }
      : { '4w': '4 wk', '12w': '12 wk', '6m': '6 mo', '1y': '1 yr' };

  const sections: Record<ProgressSection, ReactNode> = {
    since_start: <SinceStart key="since_start" progress={progress} />,
    body: (
      <Body
        key="body"
        progress={progress}
        recomposition={goal === 'recomposition'}
        today={plan.today}
        rangeWeeks={RANGE_WEEKS[range]}
      />
    ),
    performance: <Performance key="performance" progress={progress} />,
    habits: <Habits key="habits" progress={progress} />,
  };

  return (
    <Screen airy>
      <ScreenHeader title={t('progress.title')} />
      <ChoiceGroup
        single
        label={lang === 'fr' ? 'Période affichée' : 'Displayed period'}
        options={(Object.keys(RANGE_WEEKS) as ProgressRange[]).map((value) => ({
          value,
          label: rangeLabels[value],
        }))}
        selected={[range]}
        onToggle={(value: ProgressRange) => setRange(value)}
      />
      {progress.empty ? (
        <Card>
          <Text variant="title3">{t('progress.empty.title')}</Text>
          <Text>{t('progress.empty.body')}</Text>
          <Button label={t('progress.empty.cta')} onPress={() => router.push('/')} />
        </Card>
      ) : (
        <>
          {progress.notes.map((n) => (
            <Banner key={n.key} tone="primary" message={t(n.key, n.params)} />
          ))}
          {/* What changed in the program, after the user's yes (D-037 §38): two facts, no redesign. */}
          {journey.active
            .filter((a) => a.key === 'light_week' || a.key === 'exercise_change')
            .map((a) => (
              <Banner key={a.decision.id} tone="primary" message={t(`progress.adapted.${a.key}`)} />
            ))}
          <TrainingWeekCard week={journey.trainingWeek} />
          {progress.order.map((s) => sections[s])}
          <Section title={t('progress.path.title')}>
            <Path progress={progress} date={date} />
          </Section>
          <Section title={t('adaptation.title')}>
            <Recommendations recommendations={journey.recommendations} today={plan.today} effects={journey.effects} />
          </Section>
        </>
      )}
      {progress.empty ? (
        <Body
          progress={progress}
          recomposition={goal === 'recomposition'}
          today={plan.today}
          rangeWeeks={RANGE_WEEKS[range]}
        />
      ) : null}
      <Button variant="secondary" label={t('review.open')} onPress={() => router.push('/review')} />
    </Screen>
  );
}
