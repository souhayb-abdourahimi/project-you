import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('supabase_not_configured');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns true when the project requires email confirmation before the first sign-in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  if (!supabase) throw new Error('supabase_not_configured');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session === null;
}

export async function signOut() {
  await supabase?.auth.signOut();
}
