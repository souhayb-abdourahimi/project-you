import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { planNotifications } from '@/domain/notifications/engine';
import { sessionKey } from '@/domain/sync/projection';
import { nowTime } from '@/lib/format';
import { replaceScheduled } from '@/services/notifications';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';

import type { Plan } from './usePlan';

/** Re-plans local reminders whenever the week plan, completed sessions or preferences change. */
export function useNotificationScheduler(plan: Plan | null) {
  const { t } = useTranslation();
  const prefs = useNotificationStore((s) => s.prefs);
  const permission = useNotificationStore((s) => s.permission);
  const completed = useDataStore((s) => s.completedSessions);

  useEffect(() => {
    if (!plan || permission !== 'granted') return;
    const list = planNotifications({
      prefs,
      week: plan.schedule,
      motivation: plan.snapshot.motivation,
      from: { date: plan.today, time: nowTime() },
      completed: completed.map((c) => sessionKey(c.date, c.sessionIndex)),
    });
    void replaceScheduled(list, (n) => ({ title: t(n.titleKey), body: t(n.bodyKey, n.params) })).catch(() => undefined);
  }, [plan, prefs, permission, completed, t]);
}
