import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, ConfirmButton, Row, Text } from '@/components/ui';
import { readableTypes } from '@/domain/health/permissions';
import { toIsoDate } from '@/domain/shared/dates';
import { formatDate, nowTime } from '@/lib/format';

import { healthPlatform, useHealth } from './useHealth';

/** Privacy Center › "Santé et activité": what is linked, what is read, and how to stop it. */
export function HealthPrivacy() {
  const { t, i18n } = useTranslation();
  const health = useHealth();
  const store = healthPlatform ? t(`health.store.${healthPlatform}`) : '';
  const allowed = health.connected && health.permissions ? readableTypes(health.permissions, health.wanted) : [];
  const lastSync = health.lastSyncAt ? new Date(health.lastSyncAt) : null;

  return (
    <Card>
      <Text variant="heading">{t('health.privacy.title')}</Text>
      {!healthPlatform ? (
        <Text color="textMuted">{t('health.webUnsupported')}</Text>
      ) : (
        <>
          <Row>
            <Text style={{ flex: 1 }}>{store}</Text>
            <Text color="textMuted">{t(`health.statusText.${health.status}`)}</Text>
          </Row>
          {health.connected ? (
            <>
              <Text color="textMuted">
                {t('health.privacy.allowed', {
                  list: allowed.length ? allowed.map((type) => t(`health.types.${type}`)).join(', ') : '—',
                })}
              </Text>
              <Text color="textMuted">
                {lastSync
                  ? t('health.lastSync', {
                      date: formatDate(toIsoDate(lastSync), i18n.language),
                      time: nowTime(lastSync),
                    })
                  : t('health.neverSynced')}
              </Text>
              <Button
                variant="secondary"
                label={t('health.syncNow')}
                onPress={health.syncNow}
                loading={health.pending}
              />
              <ConfirmButton
                label={t('health.disconnect')}
                message={t('health.disconnectConfirm', { store })}
                onConfirm={() => void health.disconnect()}
              />
            </>
          ) : null}
        </>
      )}
      <Text variant="caption" color="textMuted">
        {t('health.privacy.explain')}
      </Text>
      {healthPlatform ? (
        <Button variant="secondary" label={t('health.privacy.manage')} onPress={() => router.push('/health')} />
      ) : null}
    </Card>
  );
}
