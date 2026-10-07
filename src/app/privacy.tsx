import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, ConfirmButton, Icon, ListGroup, ListRow, Notice, Screen, Text } from '@/components/ui';
import { DELETABLE_CATEGORIES, type PrivacyCategory } from '@/domain/privacy/data';
import { HealthPrivacy } from '@/features/health/HealthPrivacy';
import { usePrivacy } from '@/features/privacy/usePrivacy';
import { useCalendarStore } from '@/state/calendar';
import { spacing, useColors } from '@/theme';

const ALL: PrivacyCategory[] = ['profile', ...DELETABLE_CATEGORIES];

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const { counts, status, signedIn, exportData, deleteCategory, deleteEverything } = usePrivacy();
  const busy = status.kind === 'busy' ? status.action : null;
  const calendarConnected = useCalendarStore((s) => s.connected);
  const colors = useColors();
  const deletable = DELETABLE_CATEGORIES.filter((c) => counts[c] > 0);

  return (
    <Screen airy>
      <Notice role="summary" tone="info" icon="safety" message={t('privacy.intro')} />
      {status.kind === 'done' ? <Banner tone="success" message={t(`privacy.status.${status.message}`)} /> : null}
      {status.kind === 'error' ? <Banner message={t(`privacy.status.${status.message}`)} /> : null}

      <ListGroup title={t('privacy.stored')} footer={!signedIn ? t('privacy.storedLocalOnly') : undefined}>
        {ALL.map((c) => (
          <ListRow key={c} title={t(`privacy.categories.${c}`)} value={t('privacy.count', { count: counts[c] })} />
        ))}
      </ListGroup>
      <Card>
        <Text variant="caption" color="textMuted">
          {t('privacy.exportHint')}
        </Text>
        <Button label={t('privacy.export')} onPress={exportData} loading={busy === 'export'} />
      </Card>

      {deletable.length > 0 ? (
        <Card>
          <Text variant="title3">{t('privacy.deleteTitle')}</Text>
          {deletable.map((c, i) => (
            <View
              key={c}
              style={[
                styles.deleteRow,
                i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
              ]}>
              <Text variant="bodyMedium">
                {t(`privacy.categories.${c}`)} · {t('privacy.count', { count: counts[c] })}
              </Text>
              <ConfirmButton
                label={t('privacy.deleteCategory')}
                message={t('privacy.deleteCategoryConfirm', { category: t(`privacy.categories.${c}`) })}
                loading={busy === c}
                onConfirm={() => void deleteCategory(c)}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text variant="title3">{t('privacy.connections')}</Text>
        <View style={styles.inline}>
          <Icon name="program" size="sm" color="textSecondary" />
          <Text style={styles.flex}>{t('privacy.calendar')}</Text>
          <Text color="textMuted">{t(calendarConnected ? 'privacy.connected' : 'privacy.notConnected')}</Text>
        </View>
        <Button variant="secondary" label={t('privacy.manageCalendar')} onPress={() => router.push('/calendar')} />
      </Card>

      <HealthPrivacy />

      <Card>
        <Text variant="title3">{t('privacy.permissions')}</Text>
        <Text color="textMuted">{t('privacy.permissionsHint')}</Text>
        {Platform.OS !== 'web' ? (
          <Button variant="secondary" label={t('privacy.openSettings')} onPress={() => void Linking.openSettings()} />
        ) : null}
        <Button variant="secondary" label={t('privacy.notifications')} onPress={() => router.push('/notifications')} />
      </Card>

      <Card tone="subtle">
        <Text variant="title3">{signedIn ? t('privacy.deleteAccount') : t('privacy.deleteAccountLocal')}</Text>
        <Text color="textMuted">{t('privacy.deleteAccountHint')}</Text>
        <ConfirmButton
          label={signedIn ? t('privacy.deleteAccount') : t('privacy.deleteAccountLocal')}
          message={t('privacy.deleteAccountConfirm')}
          loading={busy === 'account'}
          onConfirm={() => void deleteEverything().then((done) => done && router.replace('/'))}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deleteRow: { gap: spacing.xs, paddingTop: spacing.sm },
  flex: { flex: 1 },
});
