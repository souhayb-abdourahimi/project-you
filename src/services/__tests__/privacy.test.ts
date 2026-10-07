import type { SupabaseClient } from '@supabase/supabase-js';

import { CATEGORY_TABLES, deletionOutcome } from '@/domain/privacy/data';

import { deleteRemoteCategory } from '../privacy';

/**
 * W-7.1: a deletion that stops midway is never announced as done. The result says how far it went;
 * a retry deletes again from the start (deleting what is already gone is a no-op).
 */
function fakeClient(failOn: (table: string, attempt: number) => 'error' | 'throw' | null) {
  const deleted: string[] = [];
  const attempts = new Map<string, number>();
  const client = {
    from: (table: string) => ({
      delete: () => ({
        eq: async (column: string, value: string) => {
          expect([column, value]).toEqual(['user_id', 'u']);
          const n = (attempts.get(table) ?? 0) + 1;
          attempts.set(table, n);
          const fail = failOn(table, n);
          if (fail === 'throw') throw new Error('network');
          if (fail === 'error') return { error: { message: 'refused' } };
          deleted.push(table);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, deleted };
}

describe('deleteRemoteCategory', () => {
  it('complete: every table of the category, children first', async () => {
    const { client, deleted } = fakeClient(() => null);
    expect(await deleteRemoteCategory(client, 'u', 'workouts')).toEqual({ kind: 'complete' });
    expect(deleted).toEqual(CATEGORY_TABLES.workouts);
  });

  it('a server failure midway: partial, with what is left; never a success', async () => {
    const { client, deleted } = fakeClient((t, n) => (t === 'planned_exercises' && n === 1 ? 'error' : null));
    const r = await deleteRemoteCategory(client, 'u', 'workouts');
    expect(r).toEqual({
      kind: 'partial',
      deleted: ['exercise_reports', 'exercise_substitutions', 'exercise_logs'],
      remaining: ['planned_exercises', 'workout_sessions', 'training_programs'],
    });
    expect(deletionOutcome(r)).toEqual({ clearLocal: false, message: 'delete_partial' });
    // The retry starts again from the first table and finishes.
    expect(await deleteRemoteCategory(client, 'u', 'workouts')).toEqual({ kind: 'complete' });
    expect(deleted.slice(3)).toEqual(CATEGORY_TABLES.workouts);
  });

  it('nothing confirmed (offline or refused at the first table): failed, local data kept', async () => {
    for (const fail of ['throw', 'error'] as const) {
      const { client } = fakeClient(() => fail);
      const r = await deleteRemoteCategory(client, 'u', 'journey');
      expect(r).toEqual({ kind: 'failed', remaining: CATEGORY_TABLES.journey });
      expect(deletionOutcome(r)).toEqual({ clearLocal: false, message: 'offline' });
    }
  });

  it('only a complete deletion clears the device and says "deleted"', () => {
    expect(deletionOutcome({ kind: 'complete' })).toEqual({ clearLocal: true, message: 'deleted' });
  });
});
