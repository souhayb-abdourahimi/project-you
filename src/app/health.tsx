import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ConfirmButton, Screen, Text } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import type { HealthDataType } from '@/domain/health/types';
import { HealthTypes } from '@/features/health/HealthTypes';
import { healthPlatform, useHealth } from '@/features/health/useHealth';
import { formatDate, nowTime } from '@/lib/format';

export default function HealthScreen() {
  const { t, i18n } = useTranslation();
  const health = useHealth();
  const [choice, setChoice] = useState<HealthDataType[]>(health.wanted);
  const store = healthPlatform ? t(`health.store.${healthPlatform}`) : '';
  const selected = health.connected ? health.wanted : choice;

  const toggle = (type: HealthDataType) => {
    const next = selected.includes(type) ? selected.filter((x) => x !== type) : [...selected, type];
    if (next.length === 0) return;
    if (health.connected) void health.setTypes(next);
    else setChoice(next);
  };

  if (!healthPlatform) {
    return (
      <Screen>
        <Banner message={t('health.webUnsupported')} />
        <Text color="textMuted">{t('health.manualStillWorks')}</Text>
        <Button variant="secondary" label={t('health.logManually')} onPress={() => router.push('/progress')} />
      </Screen>
    );
  }

  const lastSync = health.lastSyncAt ? new Date(health.lastSyncAt) : null;

  return (
    <Screen>
      <Text color="textMuted">{t('health.intro', { store })}</Text>
      {health.status === 'unavailable' ? (
        <Banner message={t(`health.availability.${health.availability ?? 'unavailable'}`)} />
      ) : null}
      {health.outcome === 'denied' || health.status === 'denied' ? (
        <Banner message={t('health.denied', { store })} />
      ) : null}
      {health.status === 'partial' ? <Banner message={t('health.partial', { store })} /> : null}
      {health.outcome === 'error' || health.syncError ? <Banner message={t('health.error')} /> : null}
      {health.notice ? <Banner tone="primary" message={t(`health.notice.${health.notice}`, { store })} /> : null}

      <Card>
        <Text variant="heading">{t('health.chooseTitle')}</Text>
        <HealthTypes selected={selected} onToggle={toggle} permissions={health.connected ? health.permissions : null} />
        {!health.connected ? (
          <Button
            label={t('health.connect', { store })}
            onPress={() => void health.connect(choice)}
            loading={health.pending}
            disabled={health.status === 'unavailable'}
          />
        ) : null}
      </Card>

      {health.connected ? (
        <Card>
          <Text variant="heading">{t('health.syncTitle')}</Text>
          <Text color="textMuted">
            {lastSync
              ? t('health.lastSync', { date: formatDate(toIsoDate(lastSync), i18n.language), time: nowTime(lastSync) })
              : t('health.neverSynced')}
          </Text>
          {health.status === 'connected' || health.status === 'partial' ? null : (
            <Text color="textMuted">{t(`health.statusText.${health.status}`)}</Text>
          )}
          <Button variant="secondary" label={t('health.syncNow')} onPress={health.syncNow} loading={health.pending} />
          <Button variant="secondary" label={t('health.openSettings', { store })} onPress={health.openSettings} />
        </Card>
      ) : null}

      <Card muted>
        <Text variant="heading">{t('health.useTitle')}</Text>
        <Text color="textMuted">{t('health.use')}</Text>
        <Text color="textMuted">{t('health.notUsed')}</Text>
      </Card>

      {health.connected ? (
        <Card>
          <Text color="textMuted">{t(`health.disconnectHint.${healthPlatform}`)}</Text>
          <ConfirmButton
            label={t('health.disconnect')}
            message={t('health.disconnectConfirm', { store })}
            onConfirm={() => void health.disconnect()}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
