import type { SupabaseClient } from '@supabase/supabase-js';

import { CATEGORY_TABLES, EXPORT_ONLY_TABLES, type PrivacyCategory } from '@/domain/privacy/data';
import { SYNC_TABLE_ORDER, SYNC_TABLES } from '@/domain/sync/projection';

import { fetchAllPages } from './paging';

const EXPORT_ORDER: Record<string, string> = {
  ...Object.fromEntries(SYNC_TABLE_ORDER.map((t) => [t, SYNC_TABLES[t].key])),
  notification_preferences: 'category',
  notification_settings: 'user_id',
  notification_history: 'local_date',
};

/** Reads everything the account holds (RLS limits it to the signed-in user). */
export async function fetchAccountData(
  client: SupabaseClient,
): Promise<{ account: Record<string, unknown[]>; unavailable: string[] }> {
  const account: Record<string, unknown[]> = {};
  const unavailable: string[] = [];
  for (const table of [...SYNC_TABLE_ORDER, ...EXPORT_ONLY_TABLES]) {
    try {
      const { data, error } = await fetchAllPages((from, to) => {
        const query = client.from(table).select('*');
        // Shared catalogue recipes are readable by everyone: export only the user's own.
        const own = table === 'recipes' ? query.not('owner_id', 'is', null) : query;
        return own.order(EXPORT_ORDER[table] ?? 'id').range(from, to);
      });
      if (error || !data) unavailable.push(table);
      else account[table] = data;
    } catch {
      unavailable.push(table);
    }
  }
  return { account, unavailable };
}

/** Hard-deletes a category on the server (not a soft delete: the data must really be gone). */
export async function deleteRemoteCategory(
  client: SupabaseClient,
  userId: string,
  category: PrivacyCategory,
): Promise<boolean> {
  for (const table of CATEGORY_TABLES[category]) {
    try {
      const { error } = await client.from(table).delete().eq('user_id', userId);
      if (error) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Deletes photos, then the auth user; every personal table cascades (Edge Function `delete-account`). */
export async function deleteAccount(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.functions.invoke<{ ok?: boolean }>('delete-account', { method: 'POST' });
    return !error && data?.ok === true;
  } catch {
    return false;
  }
}
