import { due, type OutboxOp } from '@/domain/sync/outbox';

/** Minimal surface of the Supabase client used by the sync, so it can be tested with a fake. */
export interface SyncClient {
  upsert: (table: string, row: Record<string, unknown>) => Promise<{ error: unknown }>;
  softDelete: (table: string, id: string, deletedAt: string) => Promise<{ error: unknown }>;
}

export interface FlushResult {
  done: string[];
  failed: string[];
}

/**
 * Pushes due outbox operations. Deletes are soft (`deleted_at`) so they propagate to other devices.
 * Never throws: failures are retried later with backoff.
 */
export async function flushOutbox(
  outbox: OutboxOp[],
  userId: string,
  client: SyncClient,
  now: string,
): Promise<FlushResult> {
  const result: FlushResult = { done: [], failed: [] };
  for (const op of due(outbox, now)) {
    try {
      const { error } =
        op.kind === 'delete'
          ? await client.softDelete(op.table, op.rowId, op.changedAt)
          : await client.upsert(op.table, { ...op.payload, id: op.rowId, user_id: userId });
      (error ? result.failed : result.done).push(op.id);
    } catch {
      result.failed.push(op.id);
    }
  }
  return result;
}
