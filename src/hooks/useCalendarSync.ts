import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import {
  busyFromEvents,
  desiredAppEvents,
  eventHash,
  planCalendarChanges,
  specDates,
  type AppEventSpec,
  type WrittenEvents,
} from '@/domain/calendar/calendar';
import { addDays } from '@/domain/shared/dates';
import { sessionKey } from '@/domain/sync/projection';
import { providers } from '@/providers';
import { useCalendarStore } from '@/state/calendar';
import { useDataStore } from '@/state/data';

import type { Plan } from './usePlan';

function statusOf(result: { status: string; reason?: string }) {
  if (result.status !== 'unavailable') return 'error' as const;
  return result.reason === 'not_supported_on_platform' ? ('unsupported' as const) : ('denied' as const);
}

/**
 * While the calendar is connected: reads this week's busy times (on open and when the app comes
 * back to the foreground) and keeps upcoming sessions in the "Project You" calendar.
 */
export function useCalendarSync(plan: Plan | null) {
  const { t } = useTranslation();
  const connected = useCalendarStore((s) => s.connected);
  const readBusy = useCalendarStore((s) => s.readBusy);
  const writeSessions = useCalendarStore((s) => s.writeSessions);
  const completed = useDataStore((s) => s.completedSessions);
  const weekStart = plan?.weekStart;
  const writing = useRef<Promise<void>>(Promise.resolve());

  // Busy times.
  useEffect(() => {
    if (!connected || !readBusy || !weekStart) return;
    let cancelled = false;
    const read = async () => {
      const [y, m, d] = weekStart.split('-').map(Number);
      const result = await providers.calendar.busyEvents(new Date(y, m - 1, d), new Date(y, m - 1, d + 7));
      if (cancelled) return;
      if (result.status === 'ok') {
        const slots = busyFromEvents(result.data, weekStart);
        const previous = useCalendarStore.getState().busy;
        if (previous?.weekStart !== weekStart || JSON.stringify(previous.slots) !== JSON.stringify(slots)) {
          useCalendarStore.getState().update({ busy: { weekStart, slots, readAt: new Date().toISOString() } });
        }
        useCalendarStore.getState().update({ status: 'idle' });
      } else useCalendarStore.getState().update({ status: statusOf(result) });
    };
    void read();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [connected, readBusy, weekStart]);

  // App events.
  const schedule = plan?.schedule;
  const today = plan?.today;
  useEffect(() => {
    if (!connected || !writeSessions || !schedule || !today) return;
    const desired = desiredAppEvents(schedule, {
      from: today,
      completed: completed.map((c) => sessionKey(c.date, c.sessionIndex)),
    });
    // One write pass at a time; each pass re-reads what was already written.
    writing.current = writing.current.then(() => apply(desired, today, (spec) => t(spec.titleKey)));
  }, [connected, writeSessions, schedule, today, completed, t]);
}

async function apply(desired: AppEventSpec[], from: string, title: (spec: AppEventSpec) => string) {
  const store = useCalendarStore.getState;
  const written: WrittenEvents = { ...store().written };
  const changes = planCalendarChanges(desired, written, from);
  if (changes.create.length + changes.update.length + changes.remove.length === 0) return;
  const input = (spec: AppEventSpec) => ({ title: title(spec), ...specDates(spec) });

  for (const spec of changes.create) {
    const r = await providers.calendar.createAppEvent(input(spec));
    if (r.status !== 'ok') return void store().update({ status: statusOf(r), written });
    written[spec.key] = { eventId: r.data, hash: eventHash(spec), date: spec.date };
  }
  for (const { spec, eventId } of changes.update) {
    const r = await providers.calendar.updateAppEvent(eventId, input(spec));
    if (r.status === 'ok') written[spec.key] = { eventId, hash: eventHash(spec), date: spec.date };
    // Deleted by hand (no longer in the app calendar): forget it so it is recreated next pass.
    // A transient error keeps it, to avoid a duplicate.
    else if (r.status === 'unavailable' && r.reason === 'permission_denied') delete written[spec.key];
  }
  for (const { key, eventId } of changes.remove) {
    await providers.calendar.deleteAppEvent(eventId);
    delete written[key];
  }
  // Past entries are history: forget them after a week so the map stays small.
  const horizon = addDays(from, -7);
  for (const [key, w] of Object.entries(written)) if (w.date < horizon) delete written[key];
  store().update({ written, status: 'idle' });
}
