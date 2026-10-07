/**
 * What the user is told about the sync (W-8, D-043): a few plain states, never a code, a table or
 * a policy name. Pure: the screen gives the round's phase and how many local changes wait.
 */
/** Failure kinds of a sync round (the service's `SyncErrorKind`). */
export type SyncErrorKindLike = 'offline' | 'conflict' | 'rls' | 'validation' | 'server' | 'invalid_data';

export type SyncView =
  /** No account: everything is kept on this device. */
  | 'local_only'
  | 'up_to_date'
  | 'syncing'
  /** Local changes not sent yet (the next round sends them). */
  | 'pending'
  /** No network: changes are kept here and sent later. */
  | 'offline'
  /** The session expired: sign in again (nothing is lost on this device). */
  | 'sign_in_again'
  /** The server refused some changes: kept on this device, sent again later. */
  | 'not_sent';

export function syncView(input: {
  signedIn: boolean;
  phase: 'idle' | 'syncing' | 'offline' | 'error';
  /** Local changes the server does not hold yet. */
  pending: number;
  /** Kinds of failure of the last round. */
  errors: readonly { kind: SyncErrorKindLike }[];
}): SyncView {
  if (!input.signedIn) return 'local_only';
  if (input.phase === 'syncing') return 'syncing';
  if (input.phase === 'offline') return 'offline';
  if (input.phase === 'error') {
    if (input.errors.some((e) => e.kind === 'rls')) return 'sign_in_again';
    return 'not_sent';
  }
  return input.pending > 0 ? 'pending' : 'up_to_date';
}

/** States worth a line outside Réglages (the main screens stay quiet when all is well). */
export const NOTEWORTHY: readonly SyncView[] = ['offline', 'sign_in_again', 'not_sent'];
