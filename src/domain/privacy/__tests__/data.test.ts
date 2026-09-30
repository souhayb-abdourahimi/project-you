import { SCENARIOS } from '../../scenarios';
import { project, type SyncableState } from '../../sync/projection';
import { buildExport, clearCategory, countByCategory, DELETABLE_CATEGORIES } from '../data';

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
};

describe('privacy data', () => {
  it('counts what is stored per category', () => {
    expect(countByCategory(state)).toMatchObject({
      profile: 1,
      motivation: 1,
      weights: 1,
      measurements: 1,
      workouts: 1,
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
});
