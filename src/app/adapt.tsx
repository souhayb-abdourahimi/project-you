import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, Screen, Text } from '@/components/ui';
import { suggestAlternatives, type Alternative, type Level } from '@/domain/motivation/anti-abandon';
import { rescheduleOptions } from '@/domain/planning/engine';
import { usePlan } from '@/hooks/usePlan';
import { sessionKey } from '@/domain/sync/projection';
import { formatDate } from '@/lib/format';
import { useDataStore } from '@/state/data';

const LEVELS: Level[] = [1, 2, 3, 4, 5];
const MINUTES = [10, 15, 20, 30, 45, 60];

/** "J'ai 15 minutes" / "Je n'ai pas envie": options adapted to today's state, never guilt. */
export default function AdaptScreen() {
  const { t, i18n } = useTranslation();
  const { mode } = useLocalSearchParams<{ mode?: 'time' | 'motivation' }>();
  const plan = usePlan();
  const reschedule = useDataStore((s) => s.reschedule);
  const logDay = useDataStore((s) => s.logDay);
  const setSessionOutcome = useDataStore((s) => s.setSessionOutcome);
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
    // Today's state feeds the coach (a tired day gets a lighter plan) and syncs with the account.
    logDay(plan.today, {
      energy,
      motivation,
      fatigue,
      availableMinutes: minutes,
      ...(mode === 'time'
        ? { mode: 'short' as const }
        : mode === 'motivation'
          ? { mode: 'low_motivation' as const }
          : {}),
    });
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
    // A walk or mobility instead of today's session: adapted, not missed. Rest: the session is
    // skipped, without catch-up. The reason is the one the user gave by opening this screen.
    const workout = plan.schedule.days.find((d) => d.date === plan.today)?.items.find((i) => i.kind === 'workout');
    if (option !== 'rest') logDay(plan.today, { activity: option, activityMinutes: option === 'walk' ? 20 : 10 });
    if (workout?.kind === 'workout') {
      const reason =
        mode === 'time'
          ? { reason: 'no_time' as const }
          : mode === 'motivation'
            ? { reason: 'no_motivation' as const }
            : {};
      setSessionOutcome(
        sessionKey(plan.today, workout.sessionIndex),
        option === 'rest' ? { status: 'skipped', ...reason } : { status: 'replaced', replacedBy: option, ...reason },
      );
    }
    setMessage(t(option === 'rest' ? 'antiAbandon.restLogged' : 'antiAbandon.activityLogged'));
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
