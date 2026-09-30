import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, ChoiceGroup, ConfirmButton, MockBadge, Row, Screen, Text } from '@/components/ui';
import { SCENARIOS } from '@/domain/scenarios';
import { signOut } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { complete, restartOnboarding, reset: resetProfile } = useProfileStore();
  const resetData = useDataStore((s) => s.reset);

  const resetAll = () => {
    resetData();
    resetProfile();
    router.replace('/');
  };

  return (
    <Screen>
      <Card>
        <Text variant="heading">{t('settings.language')}</Text>
        <ChoiceGroup
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
          selected={[i18n.language === 'en' ? 'en' : 'fr']}
          onToggle={(lng) => void i18n.changeLanguage(lng)}
        />
      </Card>
      <Card>
        <Text variant="heading">{t('settings.profile')}</Text>
        <Button
          variant="secondary"
          label={t('settings.editOnboarding')}
          onPress={() => {
            restartOnboarding();
            router.push('/onboarding');
          }}
        />
      </Card>
      <Card>
        <Text variant="heading">{t('settings.notifications')}</Text>
        <Button variant="secondary" label={t('privacy.notifications')} onPress={() => router.push('/notifications')} />
      </Card>
      <Card>
        <Text variant="heading">{t('settings.privacy')}</Text>
        <Text color="textMuted">{t('settings.privacyHint')}</Text>
        <Button variant="secondary" label={t('settings.openPrivacy')} onPress={() => router.push('/privacy')} />
        <ConfirmButton label={t('settings.resetLocal')} message={t('settings.resetConfirm')} onConfirm={resetAll} />
      </Card>
      {isSupabaseConfigured ? (
        <Card>
          <Text variant="heading">{t('settings.account')}</Text>
          <Button
            variant="secondary"
            label={t('auth.signOut')}
            onPress={async () => {
              await signOut();
              resetAll();
            }}
          />
        </Card>
      ) : null}
      {__DEV__ ? (
        <Card muted>
          <Row>
            <Text variant="heading" style={{ flex: 1 }}>
              {t('settings.dev')}
            </Text>
            <MockBadge />
          </Row>
          <Text variant="label">{t('settings.loadScenario')}</Text>
          {Object.entries(SCENARIOS).map(([name, snapshot]) => (
            <Button
              key={name}
              compact
              variant="secondary"
              label={name}
              onPress={() => {
                resetData();
                complete({ ...snapshot, createdAt: new Date().toISOString() });
                router.replace('/');
              }}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
