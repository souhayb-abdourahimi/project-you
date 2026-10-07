import { useTranslation } from 'react-i18next';

import { Button, Card, Text } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import { syncNow } from '@/hooks/useSync';
import { formatDate, nowTime } from '@/lib/format';

import { useSyncView } from './useSyncView';

/**
 * Where the data is (D-043): on this device only, up to date, waiting, offline, or something to do.
 * Plain words only: never a code, a table or a policy name.
 */
export function SyncStatusCard() {
  const { t, i18n } = useTranslation();
  const { view, pending, lastSyncedAt } = useSyncView();
  const last = lastSyncedAt ? new Date(lastSyncedAt) : null;
  return (
    <Card>
      <Text variant="heading">{t('settings.sync.title')}</Text>
      <Text accessibilityLiveRegion="polite">{t(`settings.sync.view.${view}`, { count: pending })}</Text>
      {last && view !== 'local_only' ? (
        <Text variant="caption" color="textMuted">
          {t('settings.sync.last', {
            date: formatDate(toIsoDate(last), i18n.language),
            time: nowTime(last),
          })}
        </Text>
      ) : null}
      {view === 'offline' || view === 'not_sent' || view === 'pending' ? (
        <Button variant="secondary" label={t('settings.sync.retry')} onPress={() => void syncNow()} />
      ) : null}
    </Card>
  );
}
