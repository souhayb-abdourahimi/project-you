import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { HomeFallbackButton } from '@/components/navigation/HomeFallbackButton';
import { useApplyDisplaySettings } from '@/hooks/useApplyDisplaySettings';
import { hydrated, useSync } from '@/hooks/useSync';
import { applyWebChrome, registerServiceWorker } from '@/services/web';
import { useDataStore } from '@/state/data';
import { moveLegacyCheckins } from '@/state/legacy';
import { useNotificationStore } from '@/state/notifications';
import { palette, useScheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useScheme();
  const { t, i18n } = useTranslation();
  const colors = palette[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  useSync();
  useApplyDisplaySettings();
  useEffect(() => {
    void SplashScreen.hideAsync();
    void Promise.all([hydrated(useDataStore), hydrated(useNotificationStore)]).then(moveLegacyCheckins);
    registerServiceWorker();
  }, []);
  useEffect(() => applyWebChrome(colors.background, i18n.language), [colors.background, i18n.language]);

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
        },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={({ navigation }) => ({
          headerShown: false,
          // Web: a page opened without history still has a way back (no browser bar in the installed app).
          ...(Platform.OS === 'web' && !navigation.canGoBack() ? { headerLeft: () => <HomeFallbackButton /> } : {}),
        })}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="workout/[date]" options={{ headerShown: true, title: t('workout.title') }} />
        <Stack.Screen name="inventory" options={{ headerShown: true, title: t('inventory.title') }} />
        <Stack.Screen name="shopping" options={{ headerShown: true, title: t('shopping.title') }} />
        <Stack.Screen name="meal-analysis" options={{ headerShown: true, title: t('nutrition.title') }} />
        <Stack.Screen name="settings/index" options={{ headerShown: true, title: t('settings.title') }} />
        <Stack.Screen name="settings/[section]" options={{ headerShown: true, title: t('settings.title') }} />
        <Stack.Screen name="measurements" options={{ headerShown: true, title: t('measurements.title') }} />
        <Stack.Screen name="review" options={{ headerShown: true, title: t('review.title') }} />
        <Stack.Screen name="history" options={{ headerShown: true, title: t('history.title') }} />
        <Stack.Screen name="checkin" options={{ headerShown: true, title: t('review.title') }} />
        <Stack.Screen name="privacy" options={{ headerShown: true, title: t('privacy.title') }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('notifications.title') }} />
        <Stack.Screen name="calendar" options={{ headerShown: true, title: t('calendar.title') }} />
        <Stack.Screen name="places" options={{ headerShown: true, title: t('places.title') }} />
        <Stack.Screen name="health" options={{ headerShown: true, title: t('health.title') }} />
        <Stack.Screen
          name="adapt"
          options={{ presentation: 'modal', headerShown: true, title: t('antiAbandon.title') }}
        />
      </Stack>
    </ThemeProvider>
  );
}
