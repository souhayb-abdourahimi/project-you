import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Screen, Text, TextField } from '@/components/ui';
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, signIn, signUp } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useProfileStore } from '@/state/profile';

export default function SignInScreen() {
  const { t } = useTranslation();
  const setLocalMode = useProfileStore((s) => s.setLocalMode);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!EMAIL_PATTERN.test(email.trim())) return setError(t('auth.invalidEmail'));
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('auth.weakPassword'));
    setLoading(true);
    try {
      if (mode === 'signIn') {
        await signIn(email.trim(), password);
        router.replace('/');
      } else if (await signUp(email.trim(), password)) {
        setInfo(t('auth.checkEmail'));
      } else {
        router.replace('/');
      }
    } catch {
      setError(t('auth.failed'));
    } finally {
      setLoading(false);
    }
  };

  const continueLocal = () => {
    setLocalMode(true);
    router.replace('/');
  };

  return (
    <Screen>
      <Text variant="display">{t('auth.title')}</Text>
      <Text color="textMuted">{t('auth.subtitle')}</Text>
      {!isSupabaseConfigured ? <Banner message={t('common.localMode')} /> : null}
      {isSupabaseConfigured ? (
        <>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            error={error ?? undefined}
          />
          {info ? <Banner message={info} tone="success" /> : null}
          <Button label={t(mode === 'signIn' ? 'auth.signIn' : 'auth.signUp')} onPress={submit} loading={loading} />
          <Button
            variant="ghost"
            label={t(mode === 'signIn' ? 'auth.switchToSignUp' : 'auth.switchToSignIn')}
            onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          />
        </>
      ) : null}
      <Button variant="secondary" label={t('auth.continueLocal')} onPress={continueLocal} />
    </Screen>
  );
}
