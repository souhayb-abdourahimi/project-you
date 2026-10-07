import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { milestoneFacts } from '@/domain/journey/milestones';
import type { JourneyChannelInput } from '@/domain/notifications/rules';
import { planNotifications, renderMessage } from '@/domain/notifications/engine';
import { reconcileHistory, recordPlanned, sameHistory } from '@/domain/notifications/history';
import { sessionKey } from '@/domain/sync/projection';
import { nowTime } from '@/lib/format';
import { onNotificationOpened, replaceScheduled } from '@/services/notifications';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';

import type { Journey } from './useJourney';
import type { Plan } from './usePlan';

/** What the Daily Coach decided, in the shape the notification channel reads (one engine, rule 6). */
export function channelInput(journey: Journey): JourneyChannelInput {
  const workout = journey.daily.items.find((i) => i.kind === 'workout');
  const variant = workout?.params.variant;
  return {
    milestone: journey.celebration
      ? { id: journey.celebration.id, facts: milestoneFacts(journey.celebration.id) }
      : null,
    keptGoingDates: journey.keptGoingDates,
    todayPriority: journey.coach.priority,
    todaySession: !workout
      ? 'none'
      : workout.status === 'done'
        ? undefined
        : {
            variant: variant === 'short' || variant === 'light' ? variant : 'full',
            minutes: Number(workout.params.minutes) || 0,
          },
  };
}

/**
 * Notification channel of the journey: re-plans local reminders whenever the journey state, the
 * plan or the preferences change. The device history (anti-repetition) is read at planning time
 * and updated with the new plan.
 */
export function useNotificationScheduler(plan: Plan | null, journey: Journey | null) {
  const { t } = useTranslation();
  const prefs = useNotificationStore((s) => s.prefs);
  const permission = useNotificationStore((s) => s.permission);
  const completed = useDataStore((s) => s.completedSessions);

  useEffect(() => onNotificationOpened((id) => useNotificationStore.getState().markOpened(id)), []);

  useEffect(() => {
    if (!plan || !journey || permission !== 'granted') return;
    const now = { date: plan.today, time: nowTime() };
    const history = reconcileHistory(useNotificationStore.getState().history, now);
    const list = planNotifications({
      prefs,
      week: plan.schedule,
      state: journey.state,
      from: now,
      journey: channelInput(journey),
      screenHistory: useNotificationStore.getState().screenVoice,
      completed: completed.map((c) => sessionKey(c.date, c.sessionIndex)),
      history,
    });
    void replaceScheduled(list, (n) => renderMessage(n, (key, params) => t(key, params)))
      .then(() => {
        const next = recordPlanned(history, list, new Date().toISOString());
        if (!sameHistory(useNotificationStore.getState().history, next))
          useNotificationStore.getState().setHistory(next);
      })
      .catch(() => undefined);
  }, [plan, journey, prefs, permission, completed, t]);
}
