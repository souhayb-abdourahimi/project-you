/**
 * Safety rule on the notification channel, for users who log little (PR #3), and the matrix
 * that checks no profile is congratulated or pushed while a safety signal is active.
 */
import { allPrefsOn, stateFor, translator, type StatePatch } from '../../journey/__fixtures__/journey';
import type { SafetyAssessment } from '../../journey/safety';
import { toneIssues } from '../../journey/voice/tone';
import { SAFETY_TRIGGERS, type Trigger } from '../../journey/voice/types';
import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import { recordPlanned } from '../history';
import { DEFAULT_NOTIFICATION_PREFERENCES, planNotifications, renderMessage, type PlannedWithFacts } from '../engine';

const s = SCENARIOS.studentMediumBudget;
const week = planWeek({ weekStart: '2026-09-28', schedule: s.schedule, training: s.training });
const nextWeek = planWeek({ weekStart: '2026-10-05', schedule: s.schedule, training: s.training });
const workoutDates = week.days.filter((d) => d.items.some((i) => i.kind === 'workout')).map((d) => d.date);
const from = { date: '2026-09-28', time: '00:00' };
const plan = (input: Partial<Parameters<typeof planNotifications>[0]> = {}) =>
  planNotifications({ prefs: allPrefsOn(), week, state: stateFor(), from, ...input });
const ofTrigger = (list: PlannedWithFacts[], trigger: Trigger) => list.filter((n) => n.trigger === trigger);

/** Low logging alone: an engagement signal, the safety rule stays inactive (D-027). */
const lowLogging = (since: string): Partial<SafetyAssessment> => ({ lowLogging: { since, days: 3 } });

describe('low logging: one neutral check-in per episode', () => {
  it('sends a single check-in for the episode, even across re-plans and weeks', () => {
    const state = stateFor({ safety: lowLogging('2026-09-25') });
    const first = plan({ state });
    const checkins = ofTrigger(first, 'safety_low_logging');
    expect(checkins.map((n) => n.date)).toEqual(['2026-09-28']);
    expect(checkins[0].anchorSlot).toBe('checkin');
    const { title, body } = renderMessage(checkins[0], translator('fr'));
    expect(toneIssues(`${title} ${body}`)).toEqual([]);

    // Same episode next week: already asked, nothing more.
    const history = recordPlanned([], first, '2026-09-28T08:00:00.000Z');
    const later = planNotifications({
      prefs: allPrefsOn(),
      week: nextWeek,
      state: stateFor({ today: '2026-10-05', safety: lowLogging('2026-09-25') }),
      from: { date: '2026-10-05', time: '00:00' },
      history,
    });
    expect(ofTrigger(later, 'safety_low_logging')).toEqual([]);

    // A new episode (the user logged again, then stopped) can be asked once.
    const again = planNotifications({
      prefs: allPrefsOn(),
      week: nextWeek,
      state: stateFor({ today: '2026-10-05', safety: lowLogging('2026-10-02') }),
      from: { date: '2026-10-05', time: '00:00' },
      history,
    });
    expect(ofTrigger(again, 'safety_low_logging').length).toBe(1);
  });

  it('is replaced by the full safety message when another signal is active', () => {
    const all = plan({
      state: stateFor({ safety: { flags: ['low_intake'], lowLogging: { since: '2026-09-25', days: 3 } } }),
    });
    expect(ofTrigger(all, 'safety_low_logging')).toEqual([]);
    expect(ofTrigger(all, 'safety_low_intake').length).toBeGreaterThan(0);
  });

  it('reaches the user with the meal and motivation categories off', () => {
    const prefs = allPrefsOn({
      categories: { ...DEFAULT_NOTIFICATION_PREFERENCES.categories, meals: false, motivation: false, progress: false },
    });
    expect(
      ofTrigger(plan({ prefs, state: stateFor({ safety: lowLogging('2026-09-25') }) }), 'safety_low_logging').length,
    ).toBe(1);
  });
});

describe('fast loss from few weigh-ins and load on frequency alone', () => {
  it('words the weight message as imprecise', () => {
    const all = plan({ state: stateFor({ safety: { flags: ['fast_weight_loss'], weightPrecision: 'sparse' } }) });
    const msgs = ofTrigger(all, 'safety_fast_loss');
    expect(msgs.length).toBeGreaterThan(0);
    for (const n of msgs) expect(renderMessage(n, translator('fr')).body).toMatch(/imprécise/);
  });

  it('keeps normal session reminders and proposes to slow down once in a while', () => {
    const all = plan({ state: stateFor({ safety: { flags: ['training_load'], trainingLoadBasis: 'frequency' } }) });
    expect(ofTrigger(all, 'session_planned_tired')).toEqual([]);
    expect(ofTrigger(all, 'session_planned').length).toBe(workoutDates.length);
    const proposals = ofTrigger(all, 'safety_training_load');
    expect(proposals.map((n) => n.date)).toEqual(['2026-09-28', '2026-10-01', '2026-10-04']);
    for (const n of proposals) expect(n.body[1].key).toMatch(/\.frequency\d$/);
  });
});

describe('minor or underweight user', () => {
  it('is never congratulated on weight going down', () => {
    const toward = { weightDirection: 'toward_goal' as const, goal: 'fat_loss' as const };
    expect(ofTrigger(plan({ state: stateFor(toward) }), 'weekly_progress').length).toBe(1);
    for (const profile of [
      { age: 16, noPush: true },
      { weightStatus: 'underweight' as const, noPush: true },
    ]) {
      const all = plan({ state: stateFor({ ...toward, profile }) });
      expect(ofTrigger(all, 'weekly_progress')).toEqual([]);
      expect(ofTrigger(all, 'weekly_checkin').length).toBe(1);
    }
  });
});

/**
 * Matrix: every profile × every safety signal. While a signal is active nobody is congratulated,
 * reminded of the goal or chased after an absence, and the safety message gets through.
 */
describe('matrix: no congratulations or chasing while a safety signal is active', () => {
  const FORBIDDEN: Trigger[] = [
    'success_session',
    'success_streak',
    'weekly_progress',
    'daily_why',
    'absence_gentle',
    'absence_comeback',
    'absence_last',
    'milestone_reached',
    'encouragement_kept_going',
  ];
  /** What the Daily Coach would celebrate today (D-028): a milestone and yesterday kept in a short version. */
  const journey = { milestone: { id: 'sessions_10', facts: { sessions: '10' } }, keptGoingDates: ['2026-09-28'] };
  /** Goal-pushing meanings (they also never show for minors and underweight users). */
  const PUSH = /^coach\.meaning\.(session_planned|meal_planned|daily_why)\.(lose|gain|recomp|performance)$/;

  const signals: [string, Partial<SafetyAssessment>][] = [
    ['low intake', { flags: ['low_intake'] }],
    ['low intake under the floor', { flags: ['low_intake'], belowFloor: true }],
    ['fast loss', { flags: ['fast_weight_loss'], weightPrecision: 'regular' }],
    ['fast loss, few weigh-ins', { flags: ['fast_weight_loss'], weightPrecision: 'sparse' }],
    ['load with fatigue', { flags: ['training_load'], trainingLoadBasis: 'fatigue' }],
    ['load on frequency', { flags: ['training_load'], trainingLoadBasis: 'frequency' }],
    [
      'everything',
      {
        flags: ['low_intake', 'fast_weight_loss', 'training_load'],
        lowLogging: { since: '2026-09-25', days: 3 },
      },
    ],
  ];
  const goals = [
    'fat_loss',
    'weight_loss',
    'muscle_gain',
    'recomposition',
    'maintenance',
    'fitness',
    'performance',
  ] as const;
  const people: [string, StatePatch['profile']][] = [
    ['adult', {}],
    ['minor', { age: 16, noPush: true }],
    ['underweight', { weightStatus: 'underweight', noPush: true }],
  ];
  // Everything that would normally celebrate or chase: a session yesterday, a streak milestone,
  // weight toward the goal, an old last activity, declared fatigue.
  const eager: StatePatch = {
    sessionDates: ['2026-09-27'],
    lastActivityDate: '2026-09-25',
    weeklyStreak: 4,
    sessionsThisWeek: 1,
    weightDirection: 'toward_goal',
    fatigue: 'high',
  };

  for (const [signal, safety] of signals) {
    it(`${signal}: every profile`, () => {
      for (const goal of goals) {
        for (const tone of ['gentle', 'direct'] as const) {
          for (const [, profile] of people) {
            for (const quotePersonalWords of [true, false]) {
              const all = plan({
                prefs: allPrefsOn({ quotePersonalWords }),
                state: stateFor({ ...eager, goal, tone, profile, safety }),
                journey,
              });
              const triggers = all.map((n) => n.trigger);
              expect(triggers.filter((x) => FORBIDDEN.includes(x))).toEqual([]);
              expect(triggers.some((x) => SAFETY_TRIGGERS.includes(x))).toBe(true);
              for (const n of all) {
                for (const part of [n.title, ...n.body]) expect(part.key).not.toMatch(PUSH);
              }
            }
          }
        }
      }
    });
  }

  it('low logging alone keeps the coaching on: reminders, celebrations and absence messages still go out', () => {
    // An engagement signal, not a danger one (D-027): someone who stops logging is drifting away.
    for (const [, profile] of people.filter(([who]) => who === 'adult')) {
      const all = plan({ state: stateFor({ ...eager, profile, safety: lowLogging('2026-09-25') }), journey });
      const triggers = new Set(all.map((n) => n.trigger));
      // success_streak gives way to the milestone the same evening (one celebration).
      for (const kept of ['milestone_reached', 'weekly_progress', 'daily_why'] as Trigger[]) {
        expect(triggers.has(kept)).toBe(true);
      }
      expect([...triggers].some((x) => x.startsWith('absence_'))).toBe(true);
      // The check-in is added once; reminders carry no `safety` fact and sessions are not lightened.
      expect(ofTrigger(all, 'safety_low_logging').length).toBe(1);
      for (const n of all) expect(n.facts.safety).toBeUndefined();
      // Only today's session is lightened, because of today's declared fatigue, as without the signal.
      expect(ofTrigger(all, 'session_planned_tired').map((n) => n.date)).toEqual(['2026-09-28']);
      expect(ofTrigger(all, 'session_planned').length).toBe(workoutDates.length - 1);
      expect(ofTrigger(all, 'meal_planned').some((n) => n.body[2].key === 'coach.meaning.meal_planned.lose')).toBe(
        true,
      );
    }
    // The day after a session, it is celebrated as usual unless the check-in takes that day's slot.
    const celebrated = plan({
      state: stateFor({ sessionDates: ['2026-09-28'], safety: lowLogging('2026-09-25') }),
    });
    expect(ofTrigger(celebrated, 'success_session').map((n) => n.date)).toEqual(['2026-09-29']);
  });

  it('the same profiles are congratulated and chased without a signal (the matrix is not vacuous)', () => {
    const triggers = new Set(plan({ state: stateFor(eager) }).map((n) => n.trigger));
    expect(triggers.has('success_streak')).toBe(true);
    const coached = new Set(plan({ state: stateFor(eager), journey }).map((n) => n.trigger));
    expect(coached.has('milestone_reached')).toBe(true);
    expect(coached.has('encouragement_kept_going')).toBe(true);
    expect(triggers.has('weekly_progress')).toBe(true);
    expect([...triggers].some((x) => x.startsWith('absence_'))).toBe(true);
  });
});

describe('Daily Coach on the notification channel (D-028)', () => {
  const journey = { milestone: { id: 'sessions_10', facts: { sessions: '10' } } };

  it('a milestone is celebrated once, at 19:00, and never twice across re-plans', () => {
    const first = plan({ journey });
    const msgs = ofTrigger(first, 'milestone_reached');
    expect(msgs.map((n) => [n.date, n.time, n.facts.milestone])).toEqual([['2026-09-28', '19:00', 'sessions_10']]);
    const { title } = renderMessage(msgs[0], translator('fr'));
    expect(title).toBe('10 séances terminées 🔥');
    const history = recordPlanned([], first, '2026-09-28T08:00:00.000Z');
    expect(
      ofTrigger(plan({ journey, history, from: { date: '2026-09-28', time: '20:00' } }), 'milestone_reached'),
    ).toEqual([]);
  });

  it('the morning after a kept day: "tu as gardé le fil" takes the motivation slot', () => {
    const all = plan({
      state: stateFor({ sessionDates: ['2026-09-28'] }),
      journey: { keptGoingDates: ['2026-09-28'] },
    });
    expect(ofTrigger(all, 'encouragement_kept_going').map((n) => n.date)).toEqual(['2026-09-29']);
    expect(ofTrigger(all, 'success_session').map((n) => n.date)).not.toContain('2026-09-29');
  });

  it("today's session reminder follows the Daily Coach: none on a rest day, the short version on a difficult day", () => {
    const today = '2026-09-28';
    const hasSessionToday = workoutDates.includes(today);
    const none = plan({ journey: { todaySession: 'none' } });
    expect(none.some((n) => n.trigger.startsWith('session_planned') && n.date === today)).toBe(false);
    const short = plan({ journey: { todaySession: { variant: 'short', minutes: 20 } } });
    const reminder = short.find((n) => n.trigger.startsWith('session_planned') && n.date === today);
    if (hasSessionToday) expect(reminder?.facts).toMatchObject({ short: '1', minutes: '20' });
    // Other days keep their planned reminders.
    expect(ofTrigger(none, 'session_planned').length).toBe(
      ofTrigger(plan(), 'session_planned').length - (hasSessionToday ? 1 : 0),
    );
  });

  it('the screen and the notifications share one voice history', () => {
    const alone = plan({ journey });
    const daily = ofTrigger(alone, 'daily_why')[0];
    const shared = plan({
      journey,
      screenHistory: [
        {
          templateId: daily.templateId,
          anchorSlot: daily.anchorSlot,
          date: '2026-09-27',
          time: '08:00',
          channel: 'screen',
        },
      ],
    });
    expect(ofTrigger(shared, 'daily_why')[0].templateId).not.toBe(daily.templateId);
  });
});
