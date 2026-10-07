import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, ConfirmButton, LinkRow, ListGroup, MockBadge, Row, Screen, Text } from '@/components/ui';
import { SCENARIOS } from '@/domain/scenarios';
import { SETTINGS_SECTIONS } from '@/domain/settings/sections';
import { CoachMemoryCard } from '@/features/journey/CoachMemoryCard';
import { AccountCard } from '@/features/settings/AccountCard';
import { SECTION_ICON } from '@/features/settings/icons';
import { PreferencesCard } from '@/features/settings/PreferencesCard';
import { sectionSummary } from '@/features/settings/summaries';
import { SyncStatusCard } from '@/features/settings/SyncStatusCard';
import { resetDeviceData } from '@/hooks/deviceData';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';

/**
 * Réglages (W-8, D-043): every answer of the questionnaire, the display preferences, the reminders,
 * what the coach keeps, the data and the account. One source of truth per setting
 * (docs/SETTINGS_ARCHITECTURE.md); this screen only links and summarises.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { snapshot, complete, restartOnboarding } = useProfileStore();
  const notificationsOn = useNotificationStore((s) => s.prefs.enabled);
  const year = new Date().getFullYear();

  const resetAll = async () => {
    await resetDeviceData();
    router.replace('/');
  };

  return (
    <Screen airy>
      <SyncStatusCard />
      {snapshot ? (
        <ListGroup title={t('settings.profile.title')}>
          {SETTINGS_SECTIONS.map((section) => (
            <LinkRow
              key={section}
              grouped
              icon={SECTION_ICON[section]}
              label={t(`settings.sections.${section}.title`)}
              summary={sectionSummary(section, snapshot, t, year)}
              onPress={() => router.push(`/settings/${section}`)}
            />
          ))}
        </ListGroup>
      ) : null}
      <PreferencesCard />
      <ListGroup title={t('settings.notifications')}>
        <LinkRow
          grouped
          icon="time"
          label={t('privacy.notifications')}
          summary={t(notificationsOn ? 'settings.summary.notificationsOn' : 'settings.summary.notificationsOff')}
          onPress={() => router.push('/notifications')}
        />
      </ListGroup>
      <CoachMemoryCard />
      <ListGroup title={t('settings.data.title')}>
        <LinkRow
          grouped
          icon="weight"
          label={t('settings.data.measurements')}
          summary={t('settings.data.measurementsHint')}
          onPress={() => router.push('/measurements')}
        />
        <LinkRow
          grouped
          icon="safety"
          label={t('settings.openPrivacy')}
          summary={t('settings.privacyHint')}
          onPress={() => router.push('/privacy')}
        />
      </ListGroup>
      <ListGroup title={t('settings.integrations')}>
        <LinkRow grouped icon="program" label={t('calendar.open')} onPress={() => router.push('/calendar')} />
        <LinkRow grouped icon="walk" label={t('places.open')} onPress={() => router.push('/places')} />
        <LinkRow grouped icon="steps" label={t('health.open')} onPress={() => router.push('/health')} />
      </ListGroup>
      <AccountCard />
      <Card>
        <Text variant="title3">{t('settings.restart.title')}</Text>
        <Text color="textMuted">{t('settings.restart.hint')}</Text>
        <Button
          variant="secondary"
          label={t('settings.editOnboarding')}
          onPress={() => {
            restartOnboarding();
            router.push('/onboarding');
          }}
        />
        <Text variant="caption" color="textMuted">
          {t('settings.resetHint')}
        </Text>
        <ConfirmButton label={t('settings.resetLocal')} message={t('settings.resetConfirm')} onConfirm={resetAll} />
      </Card>
      {__DEV__ ? (
        <Card muted>
          <Row>
            <Text variant="heading" style={{ flex: 1 }}>
              {t('settings.dev')}
            </Text>
            <MockBadge />
          </Row>
          <Text variant="label">{t('settings.loadScenario')}</Text>
          {Object.entries(SCENARIOS).map(([name, scenario]) => (
            <Button
              key={name}
              compact
              variant="secondary"
              label={name}
              onPress={() => {
                useDataStore.getState().reset();
                complete({ ...scenario, createdAt: new Date().toISOString() });
                router.replace('/');
              }}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
