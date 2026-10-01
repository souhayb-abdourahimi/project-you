import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, Screen, Text } from '@/components/ui';
import { suggestAlternatives, type Alternative, type Level } from '@/domain/motivation/anti-abandon';
import { rescheduleOptions } from '@/domain/planning/engine';
import { usePlan } from '@/hooks/usePlan';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';

const LEVELS: Level[] = [1, 2, 3, 4, 5];
const MINUTES = [10, 15, 20, 30, 45, 60];

/** "J'ai 15 minutes" / "Je n'ai pas envie": options adapted to today's state, never guilt. */
export default function AdaptScreen() {
  const { t, i18n } = useTranslation();
  const { mode } = useLocalSearchParams<{ mode?: 'time' | 'motivation' }>();
  const plan = usePlan();
  const reschedule = useDataStore((s) => s.reschedule);
  const logCheckin = useNotificationStore((s) => s.logCheckin);
  const [energy, setEnergy] = useState<Level>(3);
  const [motivation, setMotivation] = useState<Level>(mode === 'motivation' ? 2 : 3);
  const [fatigue, setFatigue] = useState<Level>(3);
  const [minutes, setMinutes] = useState(mode === 'time' ? 15 : 60);
  const [message, setMessage] = useState<string | null>(null);
  if (!plan) return null;

  const advice = suggestAlternatives(
    { energy, motivation, fatigue, availableMinutes: minutes },
    plan.snapshot.training.sessionMinutes,
  );

  const choose = (option: Alternative) => {
    // Today's state feeds the coach messages (a tired day gets a lighter reminder), on this device only.
    logCheckin({ date: plan.today, energy, motivation, fatigue });
    if (option === 'full_session') return router.replace(`/workout/${plan.today}`);
    if (option === 'short_session')
      return router.replace({ pathname: '/workout/[date]', params: { date: plan.today, variant: 'short' } });
    if (option === 'light_session')
      return router.replace({ pathname: '/workout/[date]', params: { date: plan.today, variant: 'light' } });
    if (option === 'reschedule') {
      const input = { weekStart: plan.weekStart, schedule: plan.snapshot.schedule, training: plan.snapshot.training };
      const [first] = rescheduleOptions(plan.schedule, plan.today, input);
      if (!first) return setMessage(t('antiAbandon.noRescheduleSlot'));
      reschedule(plan.today, first.date);
      return setMessage(t('antiAbandon.rescheduled', { date: formatDate(first.date, i18n.language) }));
    }
    setMessage(t('antiAbandon.restLogged'));
  };

  const scale = (label: string, value: Level, set: (v: Level) => void) => (
    <>
      <Text variant="label">{label}</Text>
      <ChoiceGroup options={LEVELS.map((v) => ({ value: v, label: String(v) }))} selected={[value]} onToggle={set} />
    </>
  );

  return (
    <Screen>
      <Card>
        {scale(t('antiAbandon.energy'), energy, setEnergy)}
        {scale(t('antiAbandon.motivationLevel'), motivation, setMotivation)}
        {scale(t('antiAbandon.fatigue'), fatigue, setFatigue)}
        <Text variant="label">{t('antiAbandon.available')}</Text>
        <ChoiceGroup
          options={MINUTES.map((v) => ({ value: v, label: t('common.minutes', { count: v }) }))}
          selected={[minutes]}
          onToggle={setMinutes}
        />
      </Card>
      <Text variant="heading">{t(advice.messageKey)}</Text>
      {advice.options.map((o, i) => (
        <Button
          key={o}
          variant={i === 0 ? 'primary' : 'secondary'}
          label={t(`antiAbandon.options.${o}`)}
          onPress={() => choose(o)}
        />
      ))}
      {message ? <Banner tone="success" message={message} /> : null}
    </Screen>
  );
}
