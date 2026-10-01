import { useDataStore } from './data';
import { useNotificationStore } from './notifications';

/**
 * One-time move (D-028): the check-ins the notification store kept on this device become day logs
 * of the journey, which sync with the account. A day already logged keeps its own answers.
 * Call once both stores are hydrated; does nothing when there is nothing left to move.
 */
export function moveLegacyCheckins(): void {
  const legacy = useNotificationStore.getState().checkins;
  if (legacy.length === 0) return;
  const data = useDataStore.getState();
  const logged = new Set(data.dayLogs.map((d) => d.date));
  for (const c of legacy) {
    if (logged.has(c.date)) continue;
    data.logDay(c.date, { energy: c.energy, motivation: c.motivation, fatigue: c.fatigue });
  }
  useNotificationStore.getState().clearLegacyCheckins();
}
