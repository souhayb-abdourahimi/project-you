import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import { project, SYNC_TABLE_ORDER, type SyncableState } from '../../sync/projection';
import {
  buildExport,
  CATEGORY_TABLES,
  clearCategory,
  countByCategory,
  DELETABLE_CATEGORIES,
  EXPORT_ONLY_TABLES,
} from '../data';

const state: SyncableState = {
  snapshot: SCENARIOS.vegan,
  inventory: [],
  weights: [{ id: 'w', date: '2026-09-30', weightKg: 75 }],
  waist: [{ id: 'm', date: '2026-09-30', cm: 80 }],
  expenses: [{ id: 'e', amountCents: 100, spentOn: '2026-09-30' }],
  mealPlan: null,
  completedSessions: [{ date: '2026-09-30', sessionIndex: 0, variant: 'full', completedAt: '2026-09-30T19:00:00Z' }],
  setLogs: { '2026-09-30#0': { goblet_squat: [{ reps: 10, loadKg: 16 }] } },
  sessionIds: { '2026-09-30#0': 's' },
  sessionOutcomes: { '2026-09-29#0': { status: 'skipped', reason: 'tired', at: '' } },
  swapReasons: { '2026-09-30#0': { goblet_squat: 'dislike' } },
  mealLog: [
    {
      id: 'm1',
      date: '2026-09-21',
      slot: 'lunch',
      recipeId: 'r',
      servings: 1,
      status: 'skipped',
      reason: 'no_time',
      kcal: 0,
    },
  ],
  measurements: [{ id: 'c', date: '2026-09-30', kind: 'chest', cm: 100 }],
  dayLogs: [{ date: '2026-09-30', mode: 'difficult' }],
  weeklyCheckins: [{ weekStart: '2026-09-21', weekRating: 3, answeredAt: '2026-09-27T10:00:00Z' }],
  milestones: { first_session: { reachedOn: '2026-09-30', celebratedAt: null } },
  adjustments: [],
};

describe('privacy data', () => {
  it('counts what is stored per category', () => {
    expect(countByCategory(state)).toMatchObject({
      profile: 1,
      motivation: 1,
      weights: 1,
      measurements: 2,
      workouts: 2,
      meals: 1,
      journey: 3,
    });
  });

  it('clears each category completely and only that one', () => {
    for (const category of DELETABLE_CATEGORIES) {
      const next = clearCategory(state, category);
      expect(countByCategory(next)[category]).toBe(0);
      const others = DELETABLE_CATEGORIES.filter((c) => c !== category);
      for (const o of others) expect(countByCategory(next)[o]).toBe(countByCategory(state)[o]);
    }
  });

  it('deleting the journey category removes day logs, weekly check-ins, milestones and adjustments', () => {
    const next = clearCategory(state, 'journey');
    expect([next.dayLogs, next.weeklyCheckins, next.milestones, next.adjustments]).toEqual([[], [], {}, []]);
    expect(next.sessionOutcomes).toBe(state.sessionOutcomes);
  });

  it('clearing motivation removes the answers from what is synced', () => {
    const rows = project(clearCategory(state, 'motivation'), 'u');
    expect([...rows.motivations.values()][0]).toMatchObject({ why: null, change: null, feel: null });
  });

  it('exports device and account data and names what could not be read', () => {
    const out = buildExport({
      device: state,
      account: { weight_logs: [{ id: 'w' }] },
      unavailable: ['coach_memory'],
      generatedAt: '2026-10-01T10:00:00.000Z',
      appVersion: '0.1.0',
    });
    expect(out.format).toBe('project-you-export');
    expect(out.device.weights).toHaveLength(1);
    expect(out.unavailable).toEqual(['coach_memory']);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('workouts (W-2): programs and prescriptions are exported, deleted with the category, children first', () => {
    const week = publishWeek(SCENARIOS.vegan, {
      records: { programs: [], prescriptions: {}, superseded: {}, sessionIds: state.sessionIds },
      facts: state,
      today: '2026-09-30',
      weekStart: '2026-09-28',
      seed: 'u',
      at: '2026-09-28T07:00:00.000Z',
    });
    const withTraining: SyncableState = { ...state, ...week, rescheduled: { '2026-10-02': '2026-10-03' } };
    const exported = buildExport({
      device: withTraining,
      account: null,
      unavailable: [],
      generatedAt: 'x',
      appVersion: '1',
    });
    expect(exported.device.programs).toHaveLength(1);
    expect(Object.keys(exported.device.prescriptions ?? {}).length).toBeGreaterThan(0);
    // The account export reads every synced table once (training tables are synced since W-2).
    expect(SYNC_TABLE_ORDER).toEqual(expect.arrayContaining(['training_programs', 'planned_exercises']));
    expect(EXPORT_ONLY_TABLES.filter((t) => (SYNC_TABLE_ORDER as string[]).includes(t))).toEqual([]);
    expect(CATEGORY_TABLES.workouts).toEqual([
      'exercise_substitutions',
      'exercise_logs',
      'planned_exercises',
      'workout_sessions',
      'training_programs',
    ]);
    const cleared = clearCategory(withTraining, 'workouts');
    const rows = project(cleared, 'u');
    for (const t of CATEGORY_TABLES.workouts) expect(rows[t].size).toBe(0);
    expect([cleared.programs, cleared.prescriptions, cleared.rescheduled, cleared.sessionSources]).toEqual([
      [],
      {},
      {},
      {},
    ]);
  });
});
