import type { DailyMealPlan, PlannedMeal } from '../../meals/planner';
import type { PlannedDay } from '../../planning/engine';
import { stateFor, translator, type StatePatch } from '../__fixtures__/journey';
import { buildDailyPlan, MAX_DAILY_ITEMS, type DailyPlanInput } from '../daily-plan';
import { difficultySignals, isDifficultDay, minimalVersion, noMotivationOptions, shortDay } from '../day-modes';
import { renderMessage } from '../voice/composer';
import { toneIssues } from '../voice/tone';
import type { VoiceUse } from '../voice/types';

// 2026-09-30 is a Wednesday.
const TODAY = '2026-09-30';
const t = translator('fr');

const workoutDay: PlannedDay = {
  date: TODAY,
  weekday: 3,
  items: [{ kind: 'workout', sessionIndex: 1, location: 'gym', variant: 'full', start: '18:00', end: '19:00' }],
};
const restDay: PlannedDay = { date: TODAY, weekday: 3, items: [{ kind: 'rest' }] };

const meal = (slot: PlannedMeal['slot'], status: PlannedMeal['status'] = 'planned'): PlannedMeal =>
  ({
    id: `${TODAY}-${slot}`,
    date: TODAY,
    slot,
    recipeId: 'r',
    servings: 1,
    ingredients: [],
    status,
    usesInventory: [],
  }) as unknown as PlannedMeal;
const meals = (...list: PlannedMeal[]): DailyMealPlan =>
  ({ date: TODAY, meals: list, targetKcal: 2010 }) as unknown as DailyMealPlan;

const input = (patch: Partial<DailyPlanInput> = {}, state: StatePatch = {}): DailyPlanInput => ({
  state: stateFor({ today: TODAY, ...state }),
  day: workoutDay,
  meals: meals(meal('breakfast', 'eaten'), meal('lunch'), meal('dinner')),
  session: { sessionIndex: 1, focus: 'upper', minutes: 60 },
  completed: null,
  outcome: null,
  dayLog: null,
  freeMinutesToday: null,
  fixedConstraintsToday: 0,
  weighInDay: 1,
  tracksWeight: true,
  weighedToday: false,
  weeklyCheckinDue: false,
  counts: { sessions: 12, activeDays: 20, weeks: 3 },
  history: [],
  ...patch,
});

const kinds = (p: ReturnType<typeof buildDailyPlan>) => p.items.map((i) => i.kind);
const text = (p: ReturnType<typeof buildDailyPlan>) => {
  const { title, body } = renderMessage(p.message, t);
  return `${title} ${body}`;
};

describe('DailyPlan', () => {
  it('a normal training day: the session first, then the meals, nothing else', () => {
    const p = buildDailyPlan(input());
    expect(p.kind).toBe('training');
    expect(p.mode).toBe('normal');
    expect(kinds(p)).toEqual(['workout', 'meal']);
    expect(p.main?.kind).toBe('workout');
    expect(p.items[0].params).toMatchObject({ variant: 'full', minutes: 60, start: '18:00' });
    expect(p.items[1].params).toMatchObject({ targetKcal: 2000, logged: 1, total: 3, nextSlot: 'lunch' });
    expect(p.greeting).toBe('hello');
    expect(toneIssues(text(p))).toEqual([]);
  });

  it('a rest day really looks like a rest day: recovery and meals, no checklist', () => {
    const p = buildDailyPlan(input({ day: restDay }));
    expect(p.kind).toBe('rest');
    expect(kinds(p)).toEqual(['recovery', 'meal']);
    expect(p.items[0].params).toMatchObject({ type: 'rest', walkMinutes: 15 });
    expect(['rest_day', 'daily_reflection', 'daily_tip', 'daily_why', 'progress_note']).toContain(
      p.message.templateId.split('|')[0],
    );
  });

  it('first day: one simple objective and a first-day message', () => {
    const p = buildDailyPlan(input({ counts: { sessions: 0, activeDays: 0, weeks: 0 } }, { startedOn: TODAY }));
    expect(p.kind).toBe('first_day');
    expect(p.greeting).toBe('first_day');
    expect(p.message.templateId.startsWith('first_day|')).toBe(true);
    expect(p.headline.key).toBe('daily.headline.start');
  });

  it('comeback: welcome back, a short session, no catch-up of past days', () => {
    const p = buildDailyPlan(input({}, { comeback: true }));
    expect(p.kind).toBe('comeback');
    expect(p.greeting).toBe('welcome_back');
    expect(p.items[0].params).toMatchObject({ variant: 'short', minutes: 15 });
    expect(p.items.filter((i) => i.kind === 'workout')).toHaveLength(1);
    expect(text(p)).toMatch(/Content de te revoir 👋/);
    expect(text(p)).toMatch(/On re(prend|part)/);
    expect(text(p)).not.toMatch(/disparu|manqu|rattrap/i);
  });

  it('comeback on a rest day: a 10-minute walk is the smallest step', () => {
    const p = buildDailyPlan(input({ day: restDay }, { comeback: true }));
    expect(p.items[0]).toMatchObject({ kind: 'activity', params: { activity: 'walk', minutes: 10 } });
  });

  it('difficult day (little time + tired): a 20-minute version, never dropping the programme', () => {
    const p = buildDailyPlan(input({ dayLog: { date: TODAY, availableMinutes: 25, energy: 2 } }));
    expect(p.mode).toBe('difficult');
    expect(p.items[0].params).toMatchObject({ variant: 'short', minutes: 20 });
    expect(p.adaptations[0]).toEqual({ key: 'daily.adapt.difficult_session', params: { from: 60, to: 20 } });
    expect(p.message.templateId.startsWith('difficult_day|')).toBe(true);
    expect(text(p)).toMatch(/20 minutes/);
  });

  it('difficult day when very tired: rest, meals kept', () => {
    const p = buildDailyPlan(input({ dayLog: { date: TODAY, fatigue: 5, motivation: 2 } }));
    expect(kinds(p)).toEqual(['recovery', 'meal']);
    expect(p.items[0].params).toEqual({ type: 'rest' });
  });

  it('"J’ai 15 minutes": a 15-minute session, counted as a real session', () => {
    const p = buildDailyPlan(input({ dayLog: { date: TODAY, mode: 'short' } }));
    expect(p.mode).toBe('short');
    expect(p.items[0].params).toMatchObject({ variant: 'short', minutes: 15 });
  });

  it('a session done or replaced is shown as done; a skipped one leaves a rest day', () => {
    expect(buildDailyPlan(input({ completed: { variant: 'short' } })).items[0]).toMatchObject({ status: 'done' });
    const replaced = buildDailyPlan(input({ outcome: { status: 'replaced', replacedBy: 'walk', at: '' } }));
    expect(replaced.items[0]).toMatchObject({ kind: 'activity', status: 'done' });
    const skipped = buildDailyPlan(input({ outcome: { status: 'skipped', at: '' } }));
    expect(kinds(skipped)).toEqual(['recovery', 'meal']);
    expect(skipped.kind).toBe('rest');
  });

  it('real safety signal: the notice first, no congratulation, the slowing message', () => {
    const p = buildDailyPlan(
      input({ milestone: { sessions: '10' }, keptGoingYesterday: true }, { safety: { flags: ['low_intake'] } }),
    );
    expect(p.kind).toBe('protecting');
    expect(p.items[0].kind).toBe('safety');
    expect(p.main?.kind).not.toBe('safety');
    expect(p.message.templateId.startsWith('safety_low_intake|')).toBe(true);
    expect(p.message.anchorSlot).toBe('care');
    expect(p.items.find((i) => i.kind === 'meal')?.reason).toBe('meal.full_target');
  });

  it('training load (declared fatigue): a light session instead of the full one', () => {
    const p = buildDailyPlan(input({}, { safety: { flags: ['training_load'], trainingLoadBasis: 'fatigue' } }));
    expect(p.items.find((i) => i.kind === 'workout')?.params).toMatchObject({ variant: 'light' });
  });

  it('accepted light week: the light version, explained by the decision', () => {
    const p = buildDailyPlan(input({ lightWeek: true }));
    const w = p.items.find((i) => i.kind === 'workout');
    expect(w?.params).toMatchObject({ variant: 'light' });
    expect(w?.reason).toBe('workout.light_week');
    // A difficult day still wins over the light week (strong constraints first).
    const hard = buildDailyPlan(input({ lightWeek: true, dayLog: { date: '2026-09-30', mode: 'difficult' } }));
    expect(hard.items.find((i) => i.kind === 'workout')?.reason ?? 'none').not.toBe('workout.light_week');
  });

  it('low_logging alone: coaching goes on (celebration kept) and a neutral check-in is added', () => {
    const p = buildDailyPlan(
      input({ milestone: { sessions: '10' } }, { safety: { lowLogging: { since: '2026-09-27', days: 3 } } }),
    );
    expect(p.kind).toBe('training');
    expect(p.message.templateId.startsWith('milestone_reached|')).toBe(true);
    expect(p.items.find((i) => i.kind === 'checkin')?.params).toEqual({ type: 'low_logging' });
    expect(p.items.some((i) => i.kind === 'safety')).toBe(false);
  });

  it('low_logging with a real signal: no check-in, the safety message wins', () => {
    const p = buildDailyPlan(
      input({}, { safety: { flags: ['fast_weight_loss'], lowLogging: { since: '2026-09-27', days: 3 } } }),
    );
    expect(p.items.some((i) => i.kind === 'checkin')).toBe(false);
    expect(p.message.templateId.startsWith('safety_fast_loss|')).toBe(true);
  });

  it('weigh-in only on the chosen day, check-in only when due, never more than four items', () => {
    expect(kinds(buildDailyPlan(input({ weighInDay: 3 })))).toContain('weigh_in');
    expect(kinds(buildDailyPlan(input({ weighInDay: 1 })))).not.toContain('weigh_in');
    const busy = buildDailyPlan(
      input({ weighInDay: 3, weeklyCheckinDue: true }, { safety: { flags: ['low_intake'] } }),
    );
    expect(busy.items.length).toBeLessThanOrEqual(MAX_DAILY_ITEMS);
    expect(kinds(busy)[0]).toBe('safety');
  });

  it('chooses why, change or feel from the context, never concatenated, never the same two days running', () => {
    expect(buildDailyPlan(input()).anchor?.slot).toBe('change');
    expect(buildDailyPlan(input({ day: restDay })).anchor?.slot).toBe('feel');
    expect(buildDailyPlan(input({}, { comeback: true })).anchor?.slot).toBe('why');
    const yesterday: VoiceUse[] = [
      {
        templateId: 'daily_why|v1|change.v1|v1|v1',
        anchorSlot: 'change',
        date: '2026-09-29',
        time: '08:00',
        channel: 'screen',
      },
    ];
    const p = buildDailyPlan(input({ history: yesterday }));
    expect(p.anchor?.slot).toBe('why');
    expect(p.anchor?.text).toBe('être fier de moi');
  });

  it('is stable during the day and changes from one day to the next', () => {
    const a = buildDailyPlan(input());
    const later = buildDailyPlan(
      input({
        history: [
          {
            templateId: a.message.templateId,
            anchorSlot: a.message.anchorSlot,
            date: TODAY,
            time: '09:00',
            channel: 'screen',
          },
        ],
      }),
    );
    expect(later.message.templateId).toBe(a.message.templateId);
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) =>
      buildDailyPlan(input({ day: { ...restDay, date: d }, meals: null }, { today: d })),
    );
    expect(new Set(days.map((d) => d.headline.key + JSON.stringify(d.headline.params))).size).toBeGreaterThan(1);
  });

  it('never the same kind of coach message three days in a row on the screen', () => {
    const history: VoiceUse[] = [];
    const seen: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const date = `2026-10-${String(i).padStart(2, '0')}`;
      const p = buildDailyPlan(
        input({ day: { ...restDay, date }, meals: null, history: [...history] }, { today: date }),
      );
      history.push({
        templateId: p.message.templateId,
        anchorSlot: p.message.anchorSlot,
        date,
        time: '09:00',
        channel: 'screen',
      });
      seen.push(p.message.templateId.split('|')[0]);
    }
    const KIND: Record<string, string> = {
      rest_day: 'conseil',
      daily_tip: 'conseil',
      daily_reflection: 'reflexion',
      daily_why: 'motivation',
      progress_note: 'progression',
    };
    for (let i = 2; i < seen.length; i++) {
      expect(new Set([KIND[seen[i]], KIND[seen[i - 1]], KIND[seen[i - 2]]]).size).toBeGreaterThan(1);
    }
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
  });
});

describe('day modes', () => {
  const ctx = { dayLog: null, plannedSessionMinutes: 60, freeMinutesToday: null, fixedConstraintsToday: 0 };

  it('needs two declared or planned signals (or the user saying so) to call a day difficult', () => {
    expect(isDifficultDay(ctx)).toBe(false);
    expect(isDifficultDay({ ...ctx, dayLog: { date: TODAY, motivation: 2 } })).toBe(false);
    expect(difficultySignals({ ...ctx, dayLog: { date: TODAY, motivation: 2, fatigue: 4 } })).toEqual([
      'tired',
      'low_motivation',
    ]);
    expect(isDifficultDay({ ...ctx, dayLog: { date: TODAY, motivation: 2 }, fixedConstraintsToday: 2 })).toBe(true);
    expect(isDifficultDay({ ...ctx, dayLog: { date: TODAY, mode: 'difficult' } })).toBe(true);
  });

  it('minimal version: rest, mobility, 20 or 15 minutes, or a walk', () => {
    expect(minimalVersion({ ...ctx, dayLog: { date: TODAY, fatigue: 5 } })).toEqual({ kind: 'rest' });
    expect(minimalVersion({ ...ctx, dayLog: { date: TODAY, fatigue: 4 } })).toEqual({ kind: 'mobility', minutes: 10 });
    expect(minimalVersion(ctx)).toEqual({ kind: 'session', minutes: 20 });
    expect(minimalVersion({ ...ctx, dayLog: { date: TODAY, availableMinutes: 15 } })).toEqual({
      kind: 'session',
      minutes: 15,
    });
    expect(minimalVersion({ ...ctx, plannedSessionMinutes: null })).toEqual({ kind: 'walk', minutes: 15 });
  });

  it('"J’ai 15 minutes" shortens sport, meals and organisation', () => {
    expect(
      shortDay({
        minutes: 15,
        hasSession: true,
        meals: [
          { id: 'a', status: 'planned', minutes: 25 },
          { id: 'b', status: 'planned', minutes: 5 },
          { id: 'c', status: 'eaten', minutes: 40 },
        ],
        organisation: ['meal_prep'],
      }),
    ).toEqual({ sessionMinutes: 15, mealsToSpeedUp: ['a'], deferred: ['meal_prep'] });
  });

  it('"Je n’ai pas envie": short version first, rest first when tired or slowing down, no catch-up', () => {
    const base = { dayLog: null, slowDown: false, sessionsDoneThisWeek: 0, plannedPerWeek: 3, canReschedule: true };
    expect(noMotivationOptions(base)).toEqual(['short_session', 'light_activity', 'reschedule', 'rest']);
    expect(noMotivationOptions({ ...base, dayLog: { date: TODAY, fatigue: 4 } })[0]).toBe('rest');
    expect(noMotivationOptions({ ...base, sessionsDoneThisWeek: 3 })[0]).toBe('rest');
    expect(noMotivationOptions({ ...base, slowDown: true })).not.toContain('short_session');
    expect(noMotivationOptions({ ...base, canReschedule: false })).toContain('skip_this_week');
  });
});
