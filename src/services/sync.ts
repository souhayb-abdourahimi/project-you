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
  /** `attach_reconstructed_training_history()` (W-1 migration): idempotent, RLS applies. */
  attachHistory?: () => Promise<{ error: unknown }>;
}

/**
 * Why part of a round failed (D-032), for the status and the tests. Never shown as is to the user
 * (the app only says "offline" or "not synced yet") and never logged with row contents.
 * - offline: no answer (network, timeout): retried as is;
 * - conflict: the server already holds another version of an immutable row, or a unique key; the
 *   next pull brings the server's copy and the merge reconciles;
 * - rls: refused by a row-level security policy or the session (never bypassed, never retried
 *   differently);
 * - validation: refused by a check constraint or a type (a bug: the row stays local);
 * - server: any other server error;
 * - invalid_data: rows pulled from the server that did not validate (ignored, never patched).
 */
export type SyncErrorKind = 'offline' | 'conflict' | 'rls' | 'validation' | 'server' | 'invalid_data';

export interface SyncError {
  kind: SyncErrorKind;
  phase: 'attach' | 'pull' | 'push';
  /** Table concerned (absent for rows pulled that did not validate). */
  table?: SyncTable;
  count: number;
}

/** Maps a Supabase / PostgREST / Postgres error to its kind, from its code only. */
export function classifySyncError(error: unknown): SyncErrorKind {
  if (!error || typeof error !== 'object') return 'offline';
  const { code, message } = error as { code?: unknown; message?: unknown };
  const c = typeof code === 'string' ? code : '';
  const m = typeof message === 'string' ? message : '';
  if (c === '') return 'offline';
  if (c === '42501' || c.startsWith('PGRST3')) return 'rls';
  if (c === '23505' || c === '23503') return 'conflict';
  // The immutability triggers raise check_violation with an explicit message (W-1 migration).
  if (c === '23514') return /immutable|cannot|already set/i.test(m) ? 'conflict' : 'validation';
  if (c.startsWith('22') || c === '23502' || c.startsWith('PGRST1') || c.startsWith('PGRST2')) return 'validation';
  return 'server';
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
  /** Structured failures of the round (empty when everything went through). */
  errors: SyncError[];
}

/** Sessions recorded before W-2 that the server has not attached to the reconstructed program yet. */
export function needsHistoryAttach(state: SyncableState): boolean {
  return Object.entries(state.sessionIds).some(
    ([key, id]) => !state.prescriptions?.[id] && !state.sessionSources?.[key],
  );
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
  const result: SyncResult = { pulled: 0, pushed: 0, deleted: 0, failed: 0, rejected: 0, offline: false, errors: [] };
  const fail = (kind: SyncErrorKind, phase: SyncError['phase'], table?: SyncTable, count = 1) => {
    const same = result.errors.find((e) => e.kind === kind && e.phase === phase && e.table === table);
    if (same) same.count += count;
    else result.errors.push({ kind, phase, ...(table ? { table } : {}), count });
  };

  // History recorded before W-2 joins the reconstructed program before the pull, so the pull
  // brings it back attached (D-031 3, idempotent: every device may call it).
  if (client.attachHistory && needsHistoryAttach(store.read())) {
    try {
      const { error } = await client.attachHistory();
      if (error) {
        const kind = classifySyncError(error);
        fail(kind, 'attach');
        if (kind === 'offline') {
          result.offline = true;
          return result;
        }
      }
    } catch {
      fail('offline', 'attach');
      result.offline = true;
      return result;
    }
  }

  // Pull.
  const since = cursor(store.read().lastPulledAt);
  const remote: Partial<Record<SyncTable, Row[]>> = {};
  let maxUpdatedAt = store.read().lastPulledAt;
  for (const table of SYNC_TABLE_ORDER) {
    try {
      const { data, error } = await client.select(table, since);
      if (error || !data) {
        const kind = error ? classifySyncError(error) : 'offline';
        fail(kind, 'pull', table);
        result.offline = kind === 'offline';
        return result;
      }
      remote[table] = data;
      result.pulled += data.length;
      for (const r of data) {
        const at = typeof r.updated_at === 'string' ? r.updated_at : null;
        if (at && (!maxUpdatedAt || at > maxUpdatedAt)) maxUpdatedAt = at;
      }
    } catch {
      fail('offline', 'pull', table);
      result.offline = true;
      return result;
    }
  }
  {
    const fresh = store.read();
    const merged = applyRemote(fresh, remote, userId, fresh.synced, { serverWins: options.claim });
    result.rejected = merged.rejected;
    if (merged.rejected > 0) fail('invalid_data', 'pull', undefined, merged.rejected);
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
      // Rows refused here stay local and are retried next round (a conflict is resolved by the
      // next pull: the server's copy comes back and the merge reconciles it).
      if (ok) {
        for (const u of upserts) acknowledged[rowRef(table, u.key)] = u.hash;
        result.pushed += upserts.length;
      } else {
        // Isolate the rows the server refuses, so one bad row does not block the others.
        for (const u of upserts) {
          try {
            const { error } = await client.upsert(table, [u.row], onConflict);
            if (error) {
              result.failed += 1;
              fail(classifySyncError(error), 'push', table);
            } else {
              acknowledged[rowRef(table, u.key)] = u.hash;
              result.pushed += 1;
            }
          } catch {
            result.failed += 1;
            fail('offline', 'push', table);
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
        if (error) {
          result.failed += deletes.length;
          fail(classifySyncError(error), 'push', table, deletes.length);
        } else {
          removed.push(...deletes.map((d) => rowRef(table, d.key)));
          result.deleted += deletes.length;
        }
      } catch {
        result.failed += deletes.length;
        fail('offline', 'push', table, deletes.length);
      }
    }
  }
  const synced = { ...store.read().synced, ...acknowledged };
  for (const ref of removed) delete synced[ref];
  store.write({ synced });
  return result;
}
