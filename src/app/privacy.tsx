import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { Banner, Button, Card, ConfirmButton, Row, Screen, Text } from '@/components/ui';
import { DELETABLE_CATEGORIES, type PrivacyCategory } from '@/domain/privacy/data';
import { usePrivacy } from '@/features/privacy/usePrivacy';
import { useCalendarStore } from '@/state/calendar';

const ALL: PrivacyCategory[] = ['profile', ...DELETABLE_CATEGORIES];

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const { counts, status, signedIn, exportData, deleteCategory, deleteEverything } = usePrivacy();
  const busy = status.kind === 'busy' ? status.action : null;
  const calendarConnected = useCalendarStore((s) => s.connected);

  return (
    <Screen>
      <Text color="textMuted">{t('privacy.intro')}</Text>
      {status.kind === 'done' ? <Banner tone="success" message={t(`privacy.status.${status.message}`)} /> : null}
      {status.kind === 'error' ? <Banner message={t(`privacy.status.${status.message}`)} /> : null}

      <Card>
        <Text variant="heading">{t('privacy.stored')}</Text>
        {!signedIn ? <Text color="textMuted">{t('privacy.storedLocalOnly')}</Text> : null}
        {ALL.map((c) => (
          <Row key={c}>
            <Text style={{ flex: 1 }}>{t(`privacy.categories.${c}`)}</Text>
            <Text color="textMuted">{t('privacy.count', { count: counts[c] })}</Text>
          </Row>
        ))}
        <Text variant="caption" color="textMuted">
          {t('privacy.exportHint')}
        </Text>
        <Button label={t('privacy.export')} onPress={exportData} loading={busy === 'export'} />
      </Card>

      <Card>
        <Text variant="heading">{t('privacy.deleteTitle')}</Text>
        {DELETABLE_CATEGORIES.filter((c) => counts[c] > 0).map((c) => (
          <Card key={c} muted>
            <Text variant="label">
              {t(`privacy.categories.${c}`)} · {t('privacy.count', { count: counts[c] })}
            </Text>
            <ConfirmButton
              label={t('privacy.deleteCategory')}
              message={t('privacy.deleteCategoryConfirm', { category: t(`privacy.categories.${c}`) })}
              loading={busy === c}
              onConfirm={() => void deleteCategory(c)}
            />
          </Card>
        ))}
      </Card>

      <Card>
        <Text variant="heading">{t('privacy.connections')}</Text>
        <Row>
          <Text style={{ flex: 1 }}>{t('privacy.calendar')}</Text>
          <Text color="textMuted">{t(calendarConnected ? 'privacy.connected' : 'privacy.notConnected')}</Text>
        </Row>
        <Button variant="secondary" label={t('privacy.manageCalendar')} onPress={() => router.push('/calendar')} />
        <Row>
          <Text style={{ flex: 1 }}>{t('privacy.health')}</Text>
          <Text color="textMuted">{t('privacy.notConnected')}</Text>
        </Row>
      </Card>

      <Card>
        <Text variant="heading">{t('privacy.permissions')}</Text>
        <Text color="textMuted">{t('privacy.permissionsHint')}</Text>
        {Platform.OS !== 'web' ? (
          <Button variant="secondary" label={t('privacy.openSettings')} onPress={() => void Linking.openSettings()} />
        ) : null}
        <Button variant="secondary" label={t('privacy.notifications')} onPress={() => router.push('/notifications')} />
      </Card>

      <Card>
        <Text variant="heading">{signedIn ? t('privacy.deleteAccount') : t('privacy.deleteAccountLocal')}</Text>
        <Text color="textMuted">{t('privacy.deleteAccountHint')}</Text>
        <ConfirmButton
          label={signedIn ? t('privacy.deleteAccount') : t('privacy.deleteAccountLocal')}
          message={t('privacy.deleteAccountConfirm')}
          loading={busy === 'account'}
          onConfirm={() => void deleteEverything().then(() => router.replace('/'))}
        />
      </Card>
    </Screen>
  );
}
