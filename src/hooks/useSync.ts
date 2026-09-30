import { useEffect } from 'react';

import { useSession } from '@/services/auth';
import { supabase } from '@/services/supabase';
import { flushOutbox } from '@/services/sync';
import { useDataStore } from '@/state/data';

const INTERVAL_MS = 30_000;

/** Pushes local changes to Supabase when signed in. Pull/merge is tracked in TODO.md (M-19). */
export function useSync() {
  const { session } = useSession();
  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    let running = false;
    const tick = async () => {
      const { outbox, outboxDone, outboxFailed } = useDataStore.getState();
      if (running || outbox.length === 0) return;
      running = true;
      const result = await flushOutbox(
        outbox,
        userId,
        {
          upsert: async (table, row) => client.from(table).upsert(row),
          softDelete: async (table, id, deletedAt) => client.from(table).update({ deleted_at: deletedAt }).eq('id', id),
        },
        new Date().toISOString(),
      );
      outboxDone(result.done);
      result.failed.forEach(outboxFailed);
      running = false;
    };
    void tick();
    const timer = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [userId]);
}
