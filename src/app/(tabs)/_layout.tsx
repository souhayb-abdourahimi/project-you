import { Redirect } from 'expo-router';

import AppTabs from '@/components/navigation/AppTabs';
import { LoadingScreen } from '@/components/ui';
import { ProfileUnreachable } from '@/features/account/ProfileUnreachable';
import { CalendarSync } from '@/features/calendar/CalendarSync';
import { HealthSync } from '@/features/health/HealthSync';
import { NotificationScheduler } from '@/features/notifications/NotificationScheduler';
import { useProfileGate } from '@/hooks/useProfileGate';

export default function TabsLayout() {
  const gate = useProfileGate();
  if (gate === null) return null;
  // Signed in on a new device: the account's profile is read before anything is decided.
  if (gate === 'wait') return <LoadingScreen />;
  if (gate === 'unreachable') return <ProfileUnreachable />;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;
  if (gate === 'onboarding') return <Redirect href="/onboarding" />;
  return (
    <>
      <NotificationScheduler />
      <CalendarSync />
      <HealthSync />
      <AppTabs />
    </>
  );
}
