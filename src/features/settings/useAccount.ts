import { router } from 'expo-router';
import { useState } from 'react';

import { resetDeviceData } from '@/hooks/deviceData';
import { pendingChanges, syncNow } from '@/hooks/useSync';
import { signOut, useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useProfileStore } from '@/state/profile';

export type SignOutState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'pending'; count: number } | { kind: 'failed' };

/**
 * Account actions of Réglages (D-043). Signing out clears this device (D-015), so the changes not
 * sent yet are sent first; if some still wait, the user is told how many and decides.
 */
export function useAccount() {
  const { session } = useSession();
  const localMode = useProfileStore((s) => s.localMode);
  const [state, setState] = useState<SignOutState>({ kind: 'idle' });

  const leave = async () => {
    setState({ kind: 'busy' });
    try {
      await signOut();
    } catch {
      setState({ kind: 'failed' });
      return;
    }
    await resetDeviceData();
    setState({ kind: 'idle' });
    router.replace('/');
  };

  /** Sends what waits, then signs out; stops to ask when something could not be sent. */
  const requestSignOut = async (force = false) => {
    if (!force) {
      setState({ kind: 'busy' });
      await syncNow();
      const count = pendingChanges();
      if (count > 0) {
        setState({ kind: 'pending', count });
        return;
      }
    }
    await leave();
  };

  return {
    configured: isSupabaseConfigured,
    signedIn: !!session,
    email: session?.user.email ?? null,
    localMode,
    signOutState: state,
    requestSignOut,
    cancelSignOut: () => setState({ kind: 'idle' }),
    /** Local mode → the sign-in screen (the data on this device joins the account, D-015). */
    goToSignIn: () => {
      useProfileStore.getState().setLocalMode(false);
      router.push('/sign-in');
    },
  };
}
