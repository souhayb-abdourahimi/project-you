import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button } from '@/components/ui';
import { NOTEWORTHY } from '@/domain/sync/status';

import { useSyncView } from './useSyncView';

/** One line on the main screens when the sync needs attention (offline, session expired, refused). */
export function SyncNotice() {
  const { t } = useTranslation();
  const { view, pending } = useSyncView();
  if (!NOTEWORTHY.includes(view)) return null;
  return (
    <>
      <Banner tone="textMuted" message={t(`settings.sync.view.${view}`, { count: pending })} />
      {view === 'sign_in_again' ? (
        <Button compact variant="secondary" label={t('settings.sync.details')} onPress={() => router.push('/settings')} />
      ) : null}
    </>
  );
}
