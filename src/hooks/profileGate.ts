import type { FirstPull } from '@/state/sync';

/**
 * Where the app may go once the saved data is read:
 * - `wait`: not decidable yet (the device data is not the signed-in account's yet, or its first
 *   round has not ended);
 * - `unreachable`: signed in, no profile on this device and the account could not be read yet;
 * - `sign-in`, `onboarding`, `app`.
 */
export type ProfileGate = 'wait' | 'unreachable' | 'sign-in' | 'onboarding' | 'app';

export interface ProfileGateInput {
  supabaseConfigured: boolean;
  /** The signed-in account, null when signed out. */
  userId: string | null;
  localMode: boolean;
  hasSnapshot: boolean;
  /** Account the device data belongs to (`useDataStore.ownerId`). */
  ownerId: string | null;
  firstPull: FirstPull | null;
}

/**
 * Pure routing rule. The server's profile is the only source of truth for "this account finished
 * onboarding": there is no separate flag. Signed in, a profile shown is always the account's own
 * (never the previous account's while the device switches), and "no profile" is decided only
 * from a pull of this very account that reached the server.
 */
export function profileGate(input: ProfileGateInput): ProfileGate {
  const { userId } = input;
  if (!userId) {
    if (input.supabaseConfigured && !input.localMode) return 'sign-in';
    return input.hasSnapshot ? 'app' : 'onboarding';
  }
  // The device still holds another account's data (or none attached yet): the sync clears or
  // attaches it first, so nothing of it is shown and nothing is decided from it.
  if (input.ownerId !== userId) return 'wait';
  if (input.hasSnapshot) return 'app';
  const pull = input.firstPull?.userId === userId ? input.firstPull.outcome : null;
  if (pull === 'reached') return 'onboarding';
  if (pull === 'unreachable') return 'unreachable';
  return 'wait';
}
