import { HISTORY_DAYS, markOpened, reconcileHistory, recordPlanned, sameHistory } from '../history';
import type { NotificationHistoryEntry, PlannedNotification } from '../types';

const planned = (
  date: string,
  time: string,
  trigger: PlannedNotification['trigger'] = 'daily_why',
): PlannedNotification & { facts: Record<string, string> } => ({
  id: `${date}:${trigger}`,
  trigger,
  category: 'motivation',
  date,
  time,
  templateId: `${trigger}|v1|why.v1|v1|v1`,
  anchorSlot: 'why',
  title: { key: 't', params: {} },
  body: [
    { key: 'a', params: {} },
    { key: 'b', params: {} },
    { key: 'c', params: {} },
  ],
  facts: {},
});

describe('notification history', () => {
  const history = recordPlanned(
    [],
    [planned('2026-09-30', '08:30'), planned('2026-10-01', '08:30'), planned('2026-10-02', '08:30')],
    'now',
  );

  it('records template ids and facts, never the rendered text', () => {
    expect(history[0]).toEqual({
      id: '2026-09-30:daily_why',
      trigger: 'daily_why',
      category: 'motivation',
      templateId: 'daily_why|v1|why.v1|v1|v1',
      anchorSlot: 'why',
      date: '2026-09-30',
      time: '08:30',
      status: 'scheduled',
      facts: {},
      scheduledAt: 'now',
    });
  });

  it('marks past reminders delivered and drops future ones (the new plan replaces them)', () => {
    const r = reconcileHistory(history, { date: '2026-10-01', time: '09:00' });
    expect(r.map((e) => [e.date, e.status])).toEqual([
      ['2026-09-30', 'delivered'],
      ['2026-10-01', 'delivered'],
    ]);
    expect(reconcileHistory(history, { date: '2026-10-01', time: '08:00' }).map((e) => e.date)).toEqual(['2026-09-30']);
  });

  it('keeps opened entries and prunes after 90 days', () => {
    const opened = markOpened(
      reconcileHistory(history, { date: '2026-10-03', time: '00:00' }),
      '2026-09-30:daily_why',
      'at',
    );
    expect(opened[0]).toMatchObject({ status: 'opened', openedAt: 'at' });
    const later = reconcileHistory(opened, { date: '2026-12-30', time: '00:00' });
    expect(later.map((e) => e.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(reconcileHistory(opened, { date: '2027-03-01', time: '00:00' })).toEqual([]);
    expect(HISTORY_DAYS).toBe(90);
  });

  it('replaces an entry planned again under the same id and detects no-op updates', () => {
    const again = recordPlanned(history, [planned('2026-10-02', '09:30')], 'later');
    expect(again.filter((e) => e.id === '2026-10-02:daily_why').map((e) => e.time)).toEqual(['09:30']);
    const same: NotificationHistoryEntry[] = recordPlanned(
      [],
      [planned('2026-09-30', '08:30'), planned('2026-10-01', '08:30'), planned('2026-10-02', '08:30')],
      'other',
    );
    expect(sameHistory(history, same)).toBe(true);
    expect(sameHistory(history, again)).toBe(false);
  });
});
