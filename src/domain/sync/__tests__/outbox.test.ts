import { due, enqueue, markDone, markFailed, resolveConflict, type OutboxOp } from '../outbox';

const op = (id: string, rowId: string, kind: 'upsert' | 'delete', changedAt: string) => ({
  id,
  table: 'weight_logs' as const,
  rowId,
  kind,
  payload: {},
  changedAt,
});

describe('outbox', () => {
  it('keeps only the latest op per row', () => {
    let q: OutboxOp[] = [];
    q = enqueue(q, op('1', 'r1', 'upsert', '2026-09-30T10:00:00Z'));
    q = enqueue(q, op('2', 'r1', 'delete', '2026-09-30T10:01:00Z'));
    q = enqueue(q, op('3', 'r2', 'upsert', '2026-09-30T10:02:00Z'));
    expect(q.map((o) => o.id)).toEqual(['2', '3']);
  });

  it('backs off exponentially after failures and clears done ops', () => {
    let q = enqueue([], op('1', 'r1', 'upsert', '2026-09-30T10:00:00.000Z'));
    q = markFailed(q, '1', '2026-09-30T10:00:00.000Z');
    expect(q[0].nextAttemptAt).toBe('2026-09-30T10:00:02.000Z');
    expect(due(q, '2026-09-30T10:00:01.000Z')).toHaveLength(0);
    expect(due(q, '2026-09-30T10:00:03.000Z')).toHaveLength(1);
    expect(markDone(q, ['1'])).toEqual([]);
  });

  it('resolves conflicts by last write', () => {
    const local = { id: 'a', updated_at: '2026-09-30T10:00:00Z', v: 1 };
    const remote = { id: 'a', updated_at: '2026-09-30T11:00:00Z', v: 2 };
    expect(resolveConflict(local, remote).v).toBe(2);
  });
});
