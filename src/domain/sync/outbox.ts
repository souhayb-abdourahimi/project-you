/** Offline-first write queue (see docs/ARCHITECTURE.md and D-006). Pure data structure. */

export type SyncTable =
  | 'profiles'
  | 'goals'
  | 'motivations'
  | 'user_preferences'
  | 'inventory_items'
  | 'meal_plan_items'
  | 'food_expenses'
  | 'workout_sessions'
  | 'exercise_logs'
  | 'weight_logs'
  | 'body_measurements'
  | 'daily_checkins';

export interface OutboxOp {
  id: string;
  table: SyncTable;
  rowId: string;
  kind: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  /** Client timestamp of the change, used for last-write-wins. */
  changedAt: string;
  attempts: number;
  nextAttemptAt: string;
}

/** Keeps one pending op per row: the latest change wins, a delete supersedes an upsert. */
export function enqueue(queue: OutboxOp[], op: Omit<OutboxOp, 'attempts' | 'nextAttemptAt'>): OutboxOp[] {
  const rest = queue.filter((q) => !(q.table === op.table && q.rowId === op.rowId));
  return [...rest, { ...op, attempts: 0, nextAttemptAt: op.changedAt }];
}

export function due(queue: OutboxOp[], now: string, limit = 50): OutboxOp[] {
  return queue
    .filter((op) => op.nextAttemptAt <= now)
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
    .slice(0, limit);
}

const MAX_BACKOFF_MS = 15 * 60_000;

/** Exponential backoff: 2 s, 4 s, 8 s … capped at 15 min. */
export function markFailed(queue: OutboxOp[], id: string, now: string): OutboxOp[] {
  return queue.map((op) => {
    if (op.id !== id) return op;
    const attempts = op.attempts + 1;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
    return { ...op, attempts, nextAttemptAt: new Date(Date.parse(now) + delay).toISOString() };
  });
}

export function markDone(queue: OutboxOp[], ids: string[]): OutboxOp[] {
  const done = new Set(ids);
  return queue.filter((op) => !done.has(op.id));
}

/** Last-write-wins between a local and a remote version of the same row. */
export function resolveConflict<T extends { updated_at: string }>(local: T, remote: T): T {
  return local.updated_at > remote.updated_at ? local : remote;
}
