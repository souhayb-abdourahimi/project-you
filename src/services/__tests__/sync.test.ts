import { enqueue, type OutboxOp } from '@/domain/sync/outbox';

import { flushOutbox, type SyncClient } from '../sync';

describe('flushOutbox', () => {
  const base = { table: 'weight_logs' as const, kind: 'upsert' as const, changedAt: '2026-09-30T10:00:00.000Z' };
  let queue: OutboxOp[] = [];
  queue = enqueue(queue, { ...base, id: 'op1', rowId: 'r1', payload: { weight_kg: 75 } });
  queue = enqueue(queue, { ...base, id: 'op2', rowId: 'r2', payload: { weight_kg: 74 } });

  it('attaches the user id and reports successes and failures', async () => {
    const rows: Record<string, unknown>[] = [];
    const client: SyncClient = {
      upsert: async (_table, row) => {
        rows.push(row);
        return { error: row.id === 'r2' ? new Error('network') : null };
      },
      softDelete: async () => ({ error: null }),
    };
    const result = await flushOutbox(queue, 'user-1', client, '2026-09-30T10:00:01.000Z');
    expect(result).toEqual({ done: ['op1'], failed: ['op2'] });
    expect(rows[0]).toMatchObject({ id: 'r1', user_id: 'user-1', weight_kg: 75 });
  });

  it('soft-deletes instead of upserting partial rows', async () => {
    const deleted: string[] = [];
    const q = enqueue([], { ...base, id: 'op3', rowId: 'r3', kind: 'delete', payload: {} });
    const client: SyncClient = {
      upsert: async () => ({ error: new Error('should not upsert') }),
      softDelete: async (_t, id) => {
        deleted.push(id);
        return { error: null };
      },
    };
    expect((await flushOutbox(q, 'user-1', client, '2026-09-30T10:00:01.000Z')).done).toEqual(['op3']);
    expect(deleted).toEqual(['r3']);
  });

  it('never throws when the client throws', async () => {
    const client: SyncClient = {
      upsert: async () => Promise.reject(new Error('offline')),
      softDelete: async () => Promise.reject(new Error('offline')),
    };
    const result = await flushOutbox(queue, 'user-1', client, '2026-09-30T10:00:01.000Z');
    expect(result.failed).toHaveLength(2);
  });
});
