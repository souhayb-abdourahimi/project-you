import {
  applyRemote,
  diff,
  project,
  rowRef,
  SYNC_TABLE_ORDER,
  SYNC_TABLES,
  type Row,
  type SyncableState,
  type SyncedHashes,
  type SyncTable,
} from '@/domain/sync/projection';

/** Minimal surface of the Supabase client used by the sync, so it can be tested with a fake. */
export interface SyncClient {
  /** Rows of the signed-in user (RLS) changed after `since` (all rows when null), deleted ones included. */
  select: (table: SyncTable, since: string | null) => Promise<{ data: Row[] | null; error: unknown }>;
  upsert: (table: SyncTable, rows: Row[], onConflict: string) => Promise<{ error: unknown }>;
  softDelete: (table: SyncTable, keys: string[], deletedAt: string) => Promise<{ error: unknown }>;
}

export interface SyncStore {
  /** Fresh read of the local state; called again after every await so no edit is lost. */
  read: () => SyncableState & { synced: SyncedHashes; lastPulledAt: string | null };
  write: (patch: Partial<SyncableState> & { synced?: SyncedHashes; lastPulledAt?: string | null }) => void;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
  /** Rows the server refused (they stay local and are retried). */
  failed: number;
  /** Remote rows ignored because they did not validate. */
  rejected: number;
  offline: boolean;
}

/** Re-read a small overlap so a row committed just before the cursor is not missed. */
const CURSOR_OVERLAP_MS = 60_000;

function cursor(lastPulledAt: string | null): string | null {
  return lastPulledAt ? new Date(Date.parse(lastPulledAt) - CURSOR_OVERLAP_MS).toISOString() : null;
}

/**
 * One sync round: pull (merge with local-pending-wins), then push the diff. Never throws; a
 * failure leaves rows unsynced so the next round retries them.
 * `claim` = first sync of local data into an account: the account's data wins.
 */
export async function syncOnce(
  client: SyncClient,
  store: SyncStore,
  userId: string,
  options: { claim?: boolean; now?: () => string } = {},
): Promise<SyncResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const result: SyncResult = { pulled: 0, pushed: 0, deleted: 0, failed: 0, rejected: 0, offline: false };

  // Pull.
  const since = cursor(store.read().lastPulledAt);
  const remote: Partial<Record<SyncTable, Row[]>> = {};
  let maxUpdatedAt = store.read().lastPulledAt;
  for (const table of SYNC_TABLE_ORDER) {
    try {
      const { data, error } = await client.select(table, since);
      if (error || !data) {
        result.offline = true;
        return result;
      }
      remote[table] = data;
      result.pulled += data.length;
      for (const r of data) {
        const at = typeof r.updated_at === 'string' ? r.updated_at : null;
        if (at && (!maxUpdatedAt || at > maxUpdatedAt)) maxUpdatedAt = at;
      }
    } catch {
      result.offline = true;
      return result;
    }
  }
  {
    const fresh = store.read();
    const merged = applyRemote(fresh, remote, userId, fresh.synced, { serverWins: options.claim });
    result.rejected = merged.rejected;
    store.write({ ...merged.state, synced: merged.synced, lastPulledAt: maxUpdatedAt });
  }

  // Push.
  const local = store.read();
  const plan = diff(project(local, userId), local.synced);
  const acknowledged: SyncedHashes = {};
  const removed: string[] = [];
  for (const table of SYNC_TABLE_ORDER) {
    const upserts = plan.upserts.filter((u) => u.table === table);
    if (upserts.length > 0) {
      const onConflict = SYNC_TABLES[table].key;
      let ok = false;
      try {
        ok = !(
          await client.upsert(
            table,
            upserts.map((u) => u.row),
            onConflict,
          )
        ).error;
      } catch {
        ok = false;
      }
      if (ok) {
        for (const u of upserts) acknowledged[rowRef(table, u.key)] = u.hash;
        result.pushed += upserts.length;
      } else {
        // Isolate the rows the server refuses, so one bad row does not block the others.
        for (const u of upserts) {
          try {
            const { error } = await client.upsert(table, [u.row], onConflict);
            if (error) result.failed += 1;
            else {
              acknowledged[rowRef(table, u.key)] = u.hash;
              result.pushed += 1;
            }
          } catch {
            result.failed += 1;
          }
        }
      }
    }
    const deletes = plan.deletes.filter((d) => d.table === table);
    if (deletes.length > 0) {
      try {
        const { error } = await client.softDelete(
          table,
          deletes.map((d) => d.key),
          now(),
        );
        if (error) result.failed += deletes.length;
        else {
          removed.push(...deletes.map((d) => rowRef(table, d.key)));
          result.deleted += deletes.length;
        }
      } catch {
        result.failed += deletes.length;
      }
    }
  }
  const synced = { ...store.read().synced, ...acknowledged };
  for (const ref of removed) delete synced[ref];
  store.write({ synced });
  return result;
}
