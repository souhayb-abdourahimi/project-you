import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { JourneyState } from '@/domain/journey/state';
import { planNotifications, renderMessage } from '@/domain/notifications/engine';
import { reconcileHistory, recordPlanned, sameHistory } from '@/domain/notifications/history';
import { sessionKey } from '@/domain/sync/projection';
import { nowTime } from '@/lib/format';
import { onNotificationOpened, replaceScheduled } from '@/services/notifications';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';

import type { Plan } from './usePlan';

/**
 * Notification channel of the journey: re-plans local reminders whenever the journey state, the
 * plan or the preferences change. The device history (anti-repetition) is read at planning time
 * and updated with the new plan.
 */
export function useNotificationScheduler(plan: Plan | null, state: JourneyState | null) {
  const { t } = useTranslation();
  const prefs = useNotificationStore((s) => s.prefs);
  const permission = useNotificationStore((s) => s.permission);
  const completed = useDataStore((s) => s.completedSessions);

  useEffect(() => onNotificationOpened((id) => useNotificationStore.getState().markOpened(id)), []);

  useEffect(() => {
    if (!plan || !state || permission !== 'granted') return;
    const now = { date: plan.today, time: nowTime() };
    const history = reconcileHistory(useNotificationStore.getState().history, now);
    const list = planNotifications({
      prefs,
      week: plan.schedule,
      state,
      from: now,
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
  }, [plan, state, prefs, permission, completed, t]);
}
