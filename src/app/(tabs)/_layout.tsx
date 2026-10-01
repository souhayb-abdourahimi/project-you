import { Redirect } from 'expo-router';

import AppTabs from '@/components/navigation/AppTabs';
import { LoadingScreen } from '@/components/ui';
import { CalendarSync } from '@/features/calendar/CalendarSync';
import { HealthSync } from '@/features/health/HealthSync';
import { NotificationScheduler } from '@/features/notifications/NotificationScheduler';
import { useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useProfileStore } from '@/state/profile';
import { useSyncStatus } from '@/state/sync';

export default function TabsLayout() {
  const snapshot = useProfileStore((s) => s.snapshot);
  const localMode = useProfileStore((s) => s.localMode);
  const { session, loading } = useSession();
  const initialPullDone = useSyncStatus((s) => s.initialPullDone);

  if (loading) return null;
  if (isSupabaseConfigured && !session && !localMode) return <Redirect href="/sign-in" />;
  // Signed in on a new device: wait for the account's profile before sending to onboarding.
  if (session && !snapshot && !initialPullDone) return <LoadingScreen />;
  if (!snapshot) return <Redirect href="/onboarding" />;
  return (
    <>
      <NotificationScheduler />
      <CalendarSync />
      <HealthSync />
      <AppTabs />
    </>
  );
}
