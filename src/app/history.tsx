import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingScreen, Screen, Text } from '@/components/ui';
import { HistoryWeek } from '@/features/program/HistoryWeek';
import { useTrainingHistory } from '@/features/program/useTrainingHistory';
import { useJourney } from '@/hooks/useJourney';
import { usePlan } from '@/hooks/usePlan';

/** Training history (W-6): week by week, planned vs done, versions and answers. Read only. */
export default function HistoryScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  const journey = useJourney(plan);
  const weeks = useTrainingHistory(plan, journey);
  if (!weeks) return <LoadingScreen />;
  const empty = weeks.every((w) => w.sessions.length === 0 && w.decisions.length === 0 && w.versions.length === 0);
  return (
    <Screen>
      <Text color="textMuted">{t('history.intro')}</Text>
      {empty ? (
        <EmptyState message={t('history.empty')} />
      ) : (
        weeks.map((w) => <HistoryWeek key={w.weekStart} week={w} />)
      )}
    </Screen>
  );
}
