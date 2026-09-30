import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import { DEFAULT_NOTIFICATION_PREFERENCES, isQuiet, planNotifications, type NotificationPreferences } from '../engine';

const s = SCENARIOS.studentMediumBudget;
const week = planWeek({ weekStart: '2026-09-28', schedule: s.schedule, training: s.training });
const on = (patch: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  ...patch,
});
const from = { date: '2026-09-28', time: '00:00' };

describe('NotificationEngine', () => {
  it('plans nothing until the user opts in', () => {
    expect(
      planNotifications({ prefs: DEFAULT_NOTIFICATION_PREFERENCES, week, motivation: s.motivation, from }),
    ).toEqual([]);
  });

  it('reminds an hour before each planned session and skips completed ones', () => {
    const all = planNotifications({ prefs: on(), week, motivation: s.motivation, from });
    const training = all.filter((n) => n.category === 'training');
    expect(training.length).toBeGreaterThan(0);
    const first = training[0];
    const workout = week.days.find((d) => d.date === first.date)!.items.find((i) => i.kind === 'workout');
    if (workout?.kind !== 'workout') throw new Error('expected a workout');
    const done = planNotifications({
      prefs: on(),
      week,
      motivation: s.motivation,
      from,
      completed: [`${first.date}#${workout.sessionIndex}`],
    });
    expect(done.filter((n) => n.category === 'training').length).toBe(training.length - 1);
  });

  it('respects categories, the daily cap, the minimum gap and quiet hours', () => {
    const prefs = on({
      categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, meals: true, motivation: true },
      maxPerDay: 2,
      motivationTime: '06:00',
    });
    const all = planNotifications({ prefs, week, motivation: s.motivation, from });
    const byDay = new Map<string, string[]>();
    for (const n of all) byDay.set(n.date, [...(byDay.get(n.date) ?? []), n.time]);
    for (const times of byDay.values()) {
      expect(times.length).toBeLessThanOrEqual(2);
      for (const t of times) expect(isQuiet(t, prefs.quietStart, prefs.quietEnd)).toBe(false);
    }
    // 06:00 falls in quiet hours → moved to the end of the quiet period.
    expect(all.filter((n) => n.category === 'motivation').every((n) => n.time === '07:30')).toBe(true);
    const off = planNotifications({
      prefs: on({ categories: { ...prefs.categories, training: false } }),
      week,
      motivation: s.motivation,
      from,
    });
    expect(off.some((n) => n.category === 'training')).toBe(false);
  });

  it('uses the user own words for motivation, never a guilt message', () => {
    const prefs = on({ categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, motivation: true } });
    const motivation = planNotifications({ prefs, week, motivation: { why: 'me sentir bien' }, from }).filter(
      (n) => n.category === 'motivation',
    );
    expect(motivation.length).toBeGreaterThan(0);
    expect(motivation.every((n) => n.params.why === 'me sentir bien')).toBe(true);
  });

  it('never schedules in the past', () => {
    const later = planNotifications({
      prefs: on(),
      week,
      motivation: s.motivation,
      from: { date: '2026-10-01', time: '12:00' },
    });
    expect(later.every((n) => n.date > '2026-10-01' || (n.date === '2026-10-01' && n.time >= '12:00'))).toBe(true);
  });

  it('handles quiet hours that do not cross midnight', () => {
    expect(isQuiet('13:00', '12:00', '14:00')).toBe(true);
    expect(isQuiet('23:00', '22:00', '07:00')).toBe(true);
    expect(isQuiet('08:00', '22:00', '07:00')).toBe(false);
  });

  it('drops a training reminder that quiet hours would push past the session start', () => {
    const all = planNotifications({
      prefs: on({ quietStart: '00:00', quietEnd: '23:00' }),
      week,
      motivation: s.motivation,
      from,
    });
    for (const n of all.filter((x) => x.category === 'training')) {
      expect(n.time < String(n.params?.time)).toBe(true);
    }
    expect(all.filter((x) => x.category === 'training')).toEqual([]);
  });
});
