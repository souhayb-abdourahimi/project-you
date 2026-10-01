import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useHealthStore } from '@/state/health';

import { syncHealth } from './healthSync';

/** Invisible: re-reads Apple Health / Health Connect on open and when the app comes back to the foreground. */
export function HealthSync() {
  const connected = useHealthStore((s) => s.connected);
  useEffect(() => {
    if (!connected) return;
    void syncHealth();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncHealth();
    });
    return () => sub.remove();
  }, [connected]);
  return null;
}
