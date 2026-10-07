import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import { addDays } from '../../shared/dates';
import { allPrefsOn, stateFor, translator } from '../../journey/__fixtures__/journey';
import { toneIssues } from '../../journey/voice/tone';
import { renderMessage } from '../engine';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isQuiet,
  planNotifications,
  type NotificationHistoryEntry,
  type NotificationPreferences,
  type PlannedWithFacts,
} from '../engine';
import { recordPlanned, reconcileHistory } from '../history';

const s = SCENARIOS.studentMediumBudget;
const week = planWeek({ weekStart: '2026-09-28', schedule: s.schedule, training: s.training });
const workoutDates = week.days.filter((d) => d.items.some((i) => i.kind === 'workout')).map((d) => d.date);
const restDates = week.days.map((d) => d.date).filter((d) => !workoutDates.includes(d));
const on = (patch: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  ...patch,
});
const from = { date: '2026-09-28', time: '00:00' };
const t = translator('fr');
const plan = (input: Partial<Parameters<typeof planNotifications>[0]> = {}) =>
  planNotifications({ prefs: allPrefsOn(), week, state: stateFor(), from, ...input });
const ofTrigger = (list: PlannedWithFacts[], trigger: string) => list.filter((n) => n.trigger === trigger);

describe('NotificationEngine: planning rules', () => {
  it('plans nothing until the user opts in', () => {
    expect(planNotifications({ prefs: DEFAULT_NOTIFICATION_PREFERENCES, week, state: stateFor(), from })).toEqual([]);
  });

  it('reminds an hour before each planned session and skips completed ones', () => {
    const all = plan({ prefs: on() });
    const training = all.filter((n) => n.category === 'training');
    expect(training.length).toBe(workoutDates.length);
    const first = training[0];
    const workout = week.days.find((d) => d.date === first.date)!.items.find((i) => i.kind === 'workout');
    if (workout?.kind !== 'workout') throw new Error('expected a workout');
    expect(first.facts.time).toBe(workout.start);
    const done = plan({ prefs: on(), completed: [`${first.date}#${workout.sessionIndex}`] });
    expect(done.filter((n) => n.category === 'training').length).toBe(training.length - 1);
  });

  it('respects categories, the daily cap, the minimum gap and quiet hours', () => {
    const prefs = on({
      categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, meals: true, motivation: true },
      maxPerDay: 2,
      motivationTime: '06:00',
    });
    const all = plan({ prefs });
    const byDay = new Map<string, string[]>();
    for (const n of all) byDay.set(n.date, [...(byDay.get(n.date) ?? []), n.time]);
    for (const times of byDay.values()) {
      expect(times.length).toBeLessThanOrEqual(2);
      for (const time of times) expect(isQuiet(time, prefs.quietStart, prefs.quietEnd)).toBe(false);
    }
    // 06:00 falls in quiet hours → moved to the end of the quiet period.
    expect(all.filter((n) => n.category === 'motivation').every((n) => n.time === '07:30')).toBe(true);
    const off = plan({ prefs: on({ categories: { ...prefs.categories, training: false } }) });
    expect(off.some((n) => n.category === 'training')).toBe(false);
  });

  it('never schedules in the past', () => {
    const later = plan({ from: { date: '2026-10-01', time: '12:00' } });
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((n) => n.date > '2026-10-01' || (n.date === '2026-10-01' && n.time >= '12:00'))).toBe(true);
  });

  it('handles quiet hours that do not cross midnight', () => {
    expect(isQuiet('13:00', '12:00', '14:00')).toBe(true);
    expect(isQuiet('23:00', '22:00', '07:00')).toBe(true);
    expect(isQuiet('08:00', '22:00', '07:00')).toBe(false);
  });

  it('drops a training reminder that quiet hours would push past the session start', () => {
    const all = plan({ prefs: allPrefsOn({ quietStart: '00:00', quietEnd: '23:00' }) });
    expect(all.filter((x) => x.category === 'training')).toEqual([]);
  });

  it('sends at most one motivation message per day', () => {
    const all = plan({ state: stateFor({ sessionDates: ['2026-09-27'], lastActivityDate: '2026-09-27' }) });
    const perDay = new Map<string, number>();
    for (const n of all.filter((x) => x.category === 'motivation')) perDay.set(n.date, (perDay.get(n.date) ?? 0) + 1);
    expect([...perDay.values()].every((c) => c === 1)).toBe(true);
  });

  it('plans nothing before the end of a pause', () => {
    const all = plan({ prefs: allPrefsOn({ pausedUntil: '2026-10-01' }) });
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((n) => n.date >= '2026-10-01')).toBe(true);
  });

  it('names the planned meal when there is one', () => {
    const date = '2026-09-29';
    const meals = ofTrigger(plan({ state: stateFor({ mainMeal: { [date]: 'Curry de lentilles' } }) }), 'meal_planned');
    const named = meals.find((n) => n.date === date)!;
    expect(renderMessage(named, t).body).toContain('Curry de lentilles');
    const other = meals.find((n) => n.date !== date)!;
    expect(other.body[1].key).toBe('coach.action.meal_planned.generic');
  });
});

describe('NotificationEngine: success, fatigue, progress', () => {
  it('celebrates yesterday’s session instead of the daily reminder', () => {
    // Session on Tuesday → Wednesday morning (Monday's weigh-in at 08:00 leaves no room at 08:30).
    const state = stateFor({ today: '2026-09-29', sessionDates: ['2026-09-29'], lastActivityDate: '2026-09-29' });
    const all = plan({ state, from: { date: '2026-09-29', time: '00:00' } });
    const wednesday = all.filter((n) => n.date === '2026-09-30' && n.category === 'motivation');
    expect(wednesday.map((n) => n.trigger)).toEqual(['success_session']);
    const quiet = plan({
      prefs: allPrefsOn({ celebrations: false }),
      state,
      from: { date: '2026-09-29', time: '00:00' },
    });
    expect(ofTrigger(quiet, 'success_session')).toEqual([]);
  });

  it('offers a lighter session when today’s check-in says tired, and recovery on a rest day', () => {
    const today = workoutDates[0];
    const tired = plan({ state: stateFor({ today, fatigue: 'high' }), from: { date: today, time: '00:00' } });
    expect(ofTrigger(tired, 'session_planned_tired').map((n) => n.date)).toEqual([today]);
    expect(ofTrigger(tired, 'session_planned').every((n) => n.date !== today)).toBe(true);

    const rest = restDates[0];
    const recovery = plan({ state: stateFor({ today: rest, fatigue: 'high' }), from: { date: rest, time: '00:00' } });
    expect(ofTrigger(recovery, 'fatigue_recovery').map((n) => n.date)).toEqual([rest]);
  });

  it('celebrates a weekly streak milestone once', () => {
    const state = stateFor({ weeklyStreak: 4 });
    const first = plan({ state });
    expect(ofTrigger(first, 'success_streak').map((n) => [n.date, n.facts.weeks])).toEqual([['2026-09-28', '4']]);
    const history = reconcileHistory(recordPlanned([], first, 'x'), { date: '2026-10-04', time: '23:59' });
    const again = planNotifications({
      prefs: allPrefsOn(),
      week: planWeek({ weekStart: '2026-10-05', schedule: s.schedule, training: s.training }),
      state: stateFor({ today: '2026-10-05', weeklyStreak: 4 }),
      from: { date: '2026-10-05', time: '00:00' },
      history,
    });
    expect(ofTrigger(again, 'success_streak')).toEqual([]);
    expect(ofTrigger(plan({ state: stateFor({ weeklyStreak: 5 }) }), 'success_streak')).toEqual([]);
  });

  it('turns the Sunday message into progress when the trend goes toward the goal', () => {
    const toward = plan({ state: stateFor({ weightDirection: 'toward_goal', sessionsThisWeek: 2 }) });
    const sunday = ofTrigger(toward, 'weekly_progress');
    expect(sunday.map((n) => [n.date, n.facts.sessions])).toEqual([['2026-10-04', '2']]);
    expect(ofTrigger(plan(), 'weekly_checkin').map((n) => n.date)).toEqual(['2026-10-04']);
  });
});

describe('NotificationEngine: absence (anti-abandon)', () => {
  const absence = (list: PlannedWithFacts[]) =>
    list.filter((n) => n.trigger.startsWith('absence_')).map((n) => [n.date, n.trigger]);

  it('reaches out after 2, 5 and 10 days without activity, never on a planned session day, then stops', () => {
    // Last activity on Saturday the 26th: +2 = Monday 28, +5 = Thursday 1, +10 = Tuesday 6.
    const all = plan({ state: stateFor({ lastActivityDate: '2026-09-26' }) });
    const expected = (
      [
        ['2026-09-28', 'absence_gentle'],
        ['2026-10-01', 'absence_comeback'],
        ['2026-10-06', 'absence_last'],
      ] as const
    ).filter(([date]) => !workoutDates.includes(date));
    expect(absence(all)).toEqual(expected);
    expect(absence(plan({ state: stateFor({ lastActivityDate: '2026-09-10' }) }))).toEqual([]);
  });

  it('never repeats a step of the same absence episode, and starts over after activity', () => {
    const state = stateFor({ lastActivityDate: '2026-09-26' });
    const first = plan({ state });
    const delivered: NotificationHistoryEntry[] = reconcileHistory(recordPlanned([], first, 'x'), {
      date: '2026-10-07',
      time: '00:00',
    });
    const replanned = plan({ state, history: delivered });
    expect(absence(replanned)).toEqual([]);
    // The user logs something on the 2nd: a new episode, new messages.
    const back = plan({ state: stateFor({ lastActivityDate: '2026-10-02' }), history: delivered });
    expect(absence(back).length).toBeGreaterThan(0);
  });

  it('can be turned off', () => {
    const all = plan({
      prefs: allPrefsOn({ absenceReminders: false }),
      state: stateFor({ lastActivityDate: '2026-09-26' }),
    });
    expect(absence(all)).toEqual([]);
  });
});

describe('NotificationEngine: wording', () => {
  it('always says why, one small action and why it matters, in the user’s words, without guilt', () => {
    const all = plan({
      state: stateFor({ lastActivityDate: '2026-09-26', sessionDates: ['2026-09-26'], weeklyStreak: 2 }),
    });
    expect(new Set(all.map((n) => n.trigger)).size).toBeGreaterThan(5);
    const quotes = ['être fier de moi', 'avoir plus d’énergie', 'léger et en forme'];
    for (const n of all) {
      expect(n.body.map((p) => p.key.split('.')[1])).toEqual(['anchor', 'action', 'meaning']);
      const { title, body } = renderMessage(n, t);
      expect(`${title} ${body}`).not.toMatch(/\{\{|\}\}/);
      expect(toneIssues(`${title} ${body}`)).toEqual([]);
      expect(quotes.some((q) => body.includes(q))).toBe(true);
    }
    // Every answer the user gave gets recalled, not always the same one.
    expect(new Set(all.map((n) => n.anchorSlot))).toEqual(new Set(['why', 'change', 'feel']));
  });

  it('keeps personal words off the lock screen when the user asks', () => {
    const all = plan({ prefs: allPrefsOn({ quotePersonalWords: false }) });
    for (const n of all) {
      expect(n.anchorSlot).toBe('private');
      expect(renderMessage(n, t).body).not.toContain('fier de moi');
    }
  });

  it('uses a neutral anchor when the user gave no reason', () => {
    const all = plan({ state: stateFor({ motivation: {} }) });
    expect(all.every((n) => n.anchorSlot === 'none')).toBe(true);
  });

  it('rotates the wording: the daily reminder never repeats the same message within the week', () => {
    const daily = ofTrigger(plan(), 'daily_why');
    expect(daily.length).toBeGreaterThanOrEqual(4);
    expect(new Set(daily.map((n) => n.templateId)).size).toBe(daily.length);
    for (let i = 1; i < daily.length; i++) {
      expect(daily[i].body[1].key).not.toBe(daily[i - 1].body[1].key);
      expect(daily[i].body[0].key).not.toBe(daily[i - 1].body[0].key);
    }
  });

  it('remembers last week’s wording', () => {
    const lastWeek = plan();
    const history = reconcileHistory(recordPlanned([], lastWeek, 'x'), { date: '2026-10-05', time: '00:00' });
    const nextWeek = planNotifications({
      prefs: allPrefsOn(),
      week: planWeek({ weekStart: '2026-10-05', schedule: s.schedule, training: s.training }),
      state: stateFor({ today: '2026-10-05' }),
      from: { date: '2026-10-05', time: '00:00' },
      history,
    });
    const lastSunday = ofTrigger(lastWeek, 'daily_why').at(-1)!;
    const firstMonday = ofTrigger(nextWeek, 'daily_why')[0];
    expect(firstMonday.templateId).not.toBe(lastSunday.templateId);
    expect(firstMonday.body[1].key).not.toBe(lastSunday.body[1].key);
  });

  it('is deterministic', () => {
    expect(plan()).toEqual(plan());
  });

  it('matches the tone the user chose', () => {
    const direct = plan({ state: stateFor({ tone: 'direct' }) });
    const gentle = plan();
    const keys = (list: PlannedWithFacts[]) => list.flatMap((n) => [n.title.key, ...n.body.map((p) => p.key)]);
    expect(keys(gentle).some((k) => k.endsWith('.v4') || k === 'coach.title.session_planned.v3')).toBe(false);
    expect(keys(direct).some((k) => k === 'coach.action.daily_why.v4' || k === 'coach.action.session_planned.v4')).toBe(
      true,
    );
  });

  it('sends fewer messages after several were ignored', () => {
    const ignored: NotificationHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `2026-09-2${i}:daily_why`,
      trigger: 'daily_why',
      category: 'motivation',
      templateId: 'daily_why|v1|why.v1|v1|v1',
      anchorSlot: 'why',
      date: addDays('2026-09-20', i),
      time: '08:30',
      status: 'delivered',
      facts: {},
      scheduledAt: 'x',
    }));
    const perDay = (list: PlannedWithFacts[]) =>
      Math.max(...[...new Set(list.map((n) => n.date))].map((d) => list.filter((n) => n.date === d).length));
    const prefs = allPrefsOn({ maxPerDay: 3 });
    expect(perDay(plan({ prefs }))).toBe(3);
    expect(perDay(plan({ prefs, history: ignored }))).toBe(2);
    const opened = ignored.map((e, i) => (i === 4 ? { ...e, status: 'opened' as const, openedAt: 'x' } : e));
    expect(perDay(plan({ prefs, history: opened }))).toBe(3);
  });
});

describe('NotificationEngine: safety first (CLAUDE.md rule 8)', () => {
  const lowIntake = { flags: ['low_intake' as const], belowFloor: false };
  const busy = {
    sessionDates: ['2026-09-27'],
    lastActivityDate: '2026-09-25',
    weeklyStreak: 4,
    weightDirection: 'toward_goal' as const,
  };

  it('slows down instead of congratulating or pushing', () => {
    const all = plan({ state: stateFor({ ...busy, safety: lowIntake }) });
    const triggers = new Set(all.map((n) => n.trigger));
    for (const silenced of [
      'success_session',
      'success_streak',
      'weekly_progress',
      'daily_why',
      'absence_gentle',
      'absence_comeback',
      'absence_last',
    ]) {
      expect(triggers.has(silenced as never)).toBe(false);
    }
    expect(triggers.has('weekly_checkin')).toBe(true);
    // Without the rule, the same data would celebrate and push.
    const normal = new Set(plan({ state: stateFor(busy) }).map((n) => n.trigger));
    expect(normal.has('success_streak')).toBe(true);
    expect(normal.has('weekly_progress')).toBe(true);
  });

  it('explains at most every 3 days, with a neutral anchor and a health professional', () => {
    const safety = ofTrigger(plan({ state: stateFor({ safety: lowIntake }) }), 'safety_low_intake');
    expect(safety.map((n) => n.date)).toEqual(['2026-09-28', '2026-10-01', '2026-10-04']);
    for (const n of safety) {
      expect(n.anchorSlot).toBe('care');
      const { title, body } = renderMessage(n, t);
      expect(body).toMatch(/professionnel de santé/);
      expect(toneIssues(`${title} ${body}`)).toEqual([]);
    }
  });

  it('reaches the user even with the motivation and progress categories off', () => {
    const prefs = on({
      categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, progress: false, motivation: false },
    });
    const all = plan({ prefs, state: stateFor({ safety: { flags: ['fast_weight_loss'] } }) });
    expect(ofTrigger(all, 'safety_fast_loss').length).toBeGreaterThan(0);
    // …but never when notifications are off or paused.
    expect(
      plan({ prefs: { ...prefs, enabled: false }, state: stateFor({ safety: { flags: ['fast_weight_loss'] } }) }),
    ).toEqual([]);
  });

  it('turns session reminders into lighter options when training is above plan with fatigue', () => {
    const all = plan({ state: stateFor({ safety: { flags: ['training_load'] } }) });
    expect(ofTrigger(all, 'session_planned')).toEqual([]);
    expect(ofTrigger(all, 'session_planned_tired').length).toBe(workoutDates.length);
    expect(ofTrigger(all, 'safety_training_load').length).toBeGreaterThan(0);
  });

  it('stops pushing the deficit in meal reminders', () => {
    const meals = ofTrigger(plan({ state: stateFor({ safety: lowIntake }) }), 'meal_planned');
    expect(meals.length).toBe(7);
    expect(meals.some((n) => n.body[2].key === 'coach.meaning.meal_planned.lose')).toBe(false);
    const normal = ofTrigger(plan(), 'meal_planned');
    expect(normal.some((n) => n.body[2].key === 'coach.meaning.meal_planned.lose')).toBe(true);
  });
});

describe('W-7: notifications follow the coach of the day (§43–44)', () => {
  const today = '2026-09-28';
  const milestone = { id: 'first_month', facts: { months: '1' } };

  it('a comeback, a structural proposal or the cause question leads today: no celebration, no daily why', () => {
    const normal = plan({ journey: { milestone, todayPriority: 'session' } });
    expect(ofTrigger(normal, 'milestone_reached').length).toBe(1);
    for (const todayPriority of ['comeback', 'structural', 'difficulty']) {
      const held = plan({ journey: { milestone, todayPriority } });
      const onToday = held.filter((n) => n.date === today).map((n) => n.trigger);
      expect(onToday).not.toContain('milestone_reached');
      expect(onToday).not.toContain('daily_why');
      // The days after keep their usual messages; the session reminder stays.
      expect(held.some((n) => n.date > today && n.trigger === 'daily_why')).toBe(true);
    }
  });

  it('never a motivational message at night, whatever the chosen time; the pause and the cap hold', () => {
    const night = plan({ prefs: allPrefsOn({ motivationTime: '23:30' }) });
    expect(night.filter((n) => n.category === 'motivation')).toEqual([]);
    expect(night.every((n) => n.time >= '07:30' && n.time < '22:00')).toBe(true);
    const paused = plan({ prefs: allPrefsOn({ pausedUntil: '2026-10-01' }) });
    expect(paused.every((n) => n.date >= '2026-10-01')).toBe(true);
    const capped = plan({ prefs: allPrefsOn({ maxPerDay: 1 }) });
    const perDay = new Map<string, number>();
    for (const n of capped) perDay.set(n.date, (perDay.get(n.date) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBe(1);
  });
});
