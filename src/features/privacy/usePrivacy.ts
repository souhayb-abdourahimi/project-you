import { useState } from 'react';
import { Platform, Share } from 'react-native';

import {
  buildExport,
  CATEGORY_TABLES,
  clearCategory,
  countByCategory,
  type PrivacyCategory,
} from '@/domain/privacy/data';
import { resetDeviceData } from '@/hooks/deviceData';
import { signOut, useSession } from '@/services/auth';
import { deleteAccount, deleteRemoteCategory, fetchAccountData } from '@/services/privacy';
import { supabase } from '@/services/supabase';
import { useCalendarStore } from '@/state/calendar';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';

import appJson from '../../../app.json';

export type PrivacyStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; action: string }
  | { kind: 'done'; message: 'exported' | 'deleted' | 'account_deleted' }
  | { kind: 'error'; message: 'export_failed' | 'delete_failed' | 'offline' };

function localState() {
  return { ...useDataStore.getState(), snapshot: useProfileStore.getState().snapshot };
}

async function share(json: string, fileName: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: fileName, message: json });
}

/** Privacy Center actions; the screen only renders their state. */
function deviceSettings() {
  const { connected, readBusy, writeSessions, busy, written } = useCalendarStore.getState();
  const { prefs } = useNotificationStore.getState();
  return { notifications: prefs, calendar: { connected, readBusy, writeSessions, busy, writtenEvents: written } };
}

export function usePrivacy() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<PrivacyStatus>({ kind: 'idle' });
  const inventory = useDataStore((s) => s.inventory);
  const weights = useDataStore((s) => s.weights);
  const waist = useDataStore((s) => s.waist);
  const expenses = useDataStore((s) => s.expenses);
  const mealPlan = useDataStore((s) => s.mealPlan);
  const completedSessions = useDataStore((s) => s.completedSessions);
  const setLogs = useDataStore((s) => s.setLogs);
  const sessionIds = useDataStore((s) => s.sessionIds);
  const snapshot = useProfileStore((s) => s.snapshot);
  const counts = countByCategory({
    snapshot,
    inventory,
    weights,
    waist,
    expenses,
    mealPlan,
    completedSessions,
    setLogs,
    sessionIds,
  });

  const exportData = async () => {
    setStatus({ kind: 'busy', action: 'export' });
    try {
      const remote = supabase && userId ? await fetchAccountData(supabase) : null;
      const generatedAt = new Date().toISOString();
      const data = buildExport({
        device: localState(),
        deviceSettings: deviceSettings(),
        account: remote?.account ?? null,
        unavailable: remote?.unavailable ?? [],
        generatedAt,
        appVersion: appJson.expo.version,
      });
      await share(JSON.stringify(data, null, 2), `project-you-export-${generatedAt.slice(0, 10)}.json`);
      setStatus({ kind: 'done', message: 'exported' });
    } catch {
      setStatus({ kind: 'error', message: 'export_failed' });
    }
  };

  const deleteCategory = async (category: PrivacyCategory) => {
    setStatus({ kind: 'busy', action: category });
    if (supabase && userId && !(await deleteRemoteCategory(supabase, userId, category))) {
      // Nothing is removed locally when the server refused: the user can retry, no half state.
      setStatus({ kind: 'error', message: 'offline' });
      return;
    }
    const next = clearCategory(localState(), category);
    if (next.snapshot !== useProfileStore.getState().snapshot) useProfileStore.getState().setSnapshot(next.snapshot);
    const { snapshot: _snapshot, ...data } = next;
    useDataStore.getState().applySync(data);
    useDataStore.getState().forgetSynced(CATEGORY_TABLES[category]);
    setStatus({ kind: 'done', message: 'deleted' });
  };

  const deleteEverything = async () => {
    setStatus({ kind: 'busy', action: 'account' });
    if (supabase && userId) {
      if (!(await deleteAccount(supabase))) {
        setStatus({ kind: 'error', message: 'delete_failed' });
        return;
      }
      await signOut().catch(() => undefined);
    }
    await resetDeviceData();
    setStatus({ kind: 'done', message: 'account_deleted' });
  };

  return { counts, status, signedIn: !!userId, exportData, deleteCategory, deleteEverything };
}
