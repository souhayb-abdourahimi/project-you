import { useCallback, useEffect, useState } from 'react';

import { calendarFeedProvider, type FeedSummary } from '@/providers/calendar-feed';
import { useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useCalendarFeedStore, type CalendarFeedIssue } from '@/state/calendarFeed';

export type FeedPhase = 'idle' | 'testing' | 'saving' | 'refreshing' | 'removing';

/**
 * View model of "Ajouter un calendrier iCal" (D-049): paste → Tester le lien → Utiliser ce
 * calendrier; then Actualiser, switch off, delete. Needs an account (the server reads the feed).
 * The screen renders this state only.
 */
export function useCalendarFeed() {
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;
  const link = useCalendarFeedStore((s) => s.link);
  const setLink = useCalendarFeedStore((s) => s.set);
  const patch = useCalendarFeedStore((s) => s.patch);
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<FeedPhase>('idle');
  const [tested, setTested] = useState<FeedSummary | null>(null);
  const [issue, setIssue] = useState<CalendarFeedIssue | null>(null);

  // The account is the source of truth: read it when the screen opens (the cache stays offline).
  useEffect(() => {
    if (!userId) return;
    let live = true;
    calendarFeedProvider.load().then((r) => {
      if (live && r.status === 'ok') setLink(r.data);
    });
    return () => {
      live = false;
    };
  }, [userId, setLink]);

  const editUrl = useCallback((next: string) => {
    setUrl(next);
    setTested(null);
    setIssue(null);
  }, []);

  const test = useCallback(async () => {
    setPhase('testing');
    setIssue(null);
    setTested(null);
    const r = await calendarFeedProvider.test(url);
    setPhase('idle');
    if (r.status === 'ok') setTested(r.data);
    else setIssue(r.issue);
  }, [url]);

  const use = useCallback(async () => {
    setPhase('saving');
    setIssue(null);
    const r = await calendarFeedProvider.save(url);
    setPhase('idle');
    if (r.status !== 'ok') {
      setIssue(r.issue);
      return;
    }
    setLink({
      host: r.data.host,
      enabled: true,
      busy: r.data.busy,
      eventCount: r.data.eventCount,
      syncedAt: r.data.syncedAt,
      issue: null,
    });
    // The link is not kept on the device once it is sealed on the server.
    setUrl('');
    setTested(null);
  }, [url, setLink]);

  const refresh = useCallback(async () => {
    setPhase('refreshing');
    setIssue(null);
    const r = await calendarFeedProvider.refresh();
    setPhase('idle');
    if (r.status === 'ok')
      patch({ busy: r.data.busy, eventCount: r.data.eventCount, syncedAt: r.data.syncedAt, issue: null });
    else {
      setIssue(r.issue);
      patch({ issue: r.issue });
    }
  }, [patch]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!userId) return;
      const r = await calendarFeedProvider.setEnabled(userId, enabled);
      if (r.status === 'ok') patch({ enabled });
      else setIssue(r.issue);
    },
    [userId, patch],
  );

  const remove = useCallback(async () => {
    if (!userId) return false;
    setPhase('removing');
    const r = await calendarFeedProvider.remove(userId);
    setPhase('idle');
    if (r.status !== 'ok') {
      setIssue(r.issue);
      return false;
    }
    setLink(null);
    return true;
  }, [userId, setLink]);

  return {
    /** No account service in this build, or not signed in: the iCal link cannot work. */
    available: isSupabaseConfigured && !!userId,
    checkingAccount: loading,
    link,
    url,
    editUrl,
    phase,
    tested,
    issue,
    test,
    use,
    refresh,
    setEnabled,
    remove,
  };
}

export type CalendarFeedModel = ReturnType<typeof useCalendarFeed>;
