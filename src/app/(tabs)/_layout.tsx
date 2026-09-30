import { Redirect } from 'expo-router';

import AppTabs from '@/components/navigation/AppTabs';
import { useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useProfileStore } from '@/state/profile';

export default function TabsLayout() {
  const snapshot = useProfileStore((s) => s.snapshot);
  const localMode = useProfileStore((s) => s.localMode);
  const { session, loading } = useSession();

  if (loading) return null;
  if (isSupabaseConfigured && !session && !localMode) return <Redirect href="/sign-in" />;
  if (!snapshot) return <Redirect href="/onboarding" />;
  return <AppTabs />;
}
