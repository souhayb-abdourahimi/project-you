import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { isClientSafeKey } from './keys';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
/**
 * Public client key only: the publishable key (`sb_publishable_…`), or the legacy anon key.
 * Data security relies on Auth + RLS, never on this key being secret.
 */
const publishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when no Supabase project is configured: the app then runs in local mode. */
export const isSupabaseConfigured = url.startsWith('https://') && isClientSafeKey(publishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
