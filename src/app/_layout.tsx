import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useSync } from '@/hooks/useSync';
import { palette, useScheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useScheme();
  const { t } = useTranslation();
  const colors = palette[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  useSync();
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="workout/[date]" options={{ headerShown: true, title: t('workout.title') }} />
        <Stack.Screen name="inventory" options={{ headerShown: true, title: t('inventory.title') }} />
        <Stack.Screen name="shopping" options={{ headerShown: true, title: t('shopping.title') }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: t('settings.title') }} />
        <Stack.Screen
          name="adapt"
          options={{ presentation: 'modal', headerShown: true, title: t('antiAbandon.title') }}
        />
      </Stack>
    </ThemeProvider>
  );
}
