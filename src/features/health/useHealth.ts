import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { connectionStatus } from '@/domain/health/permissions';
import type { HealthDataType } from '@/domain/health/types';
import { providers } from '@/providers';
import { useHealthStore } from '@/state/health';

import { connectHealth, disconnectHealth, setSharedTypes, syncHealth } from './healthSync';

/** Apple Health on iOS, Health Connect on Android, nothing on web. */
export const healthPlatform = Platform.OS === 'ios' ? 'apple' : Platform.OS === 'android' ? 'google' : null;

export type ConnectOutcome = Awaited<ReturnType<typeof connectHealth>> | null;

/** Health link state and actions for screens; all platform code stays in src/providers/health.*. */
export function useHealth() {
  const state = useHealthStore();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<ConnectOutcome>(null);
  const update = state.update;

  // Tell right away when Health Connect is missing or needs an update, before any tap.
  useEffect(() => {
    if (!healthPlatform) return;
    void providers.health.getAvailability().then((availability) => update({ availability }));
  }, [update]);
  const status = connectionStatus({
    availability: healthPlatform ? (state.availability ?? 'available') : 'not_supported',
    connected: state.connected,
    permissions: state.permissions,
    wanted: state.wanted,
  });

  const run = async <T>(action: () => Promise<T>) => {
    setPending(true);
    try {
      return await action();
    } finally {
      setPending(false);
    }
  };

  return {
    ...state,
    status,
    pending: pending || state.status === 'syncing',
    /** The last read was incomplete; values already imported are kept. */
    syncError: state.status === 'error',
    outcome,
    connect: (types: HealthDataType[]) => run(async () => setOutcome(await connectHealth(types))),
    syncNow: () => run(() => syncHealth({ force: true })),
    disconnect: () => run(disconnectHealth),
    setTypes: (types: HealthDataType[]) => run(() => setSharedTypes(types)),
    openSettings: () => providers.health.openSettings(),
  };
}
