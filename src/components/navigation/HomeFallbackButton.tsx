import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui';

/**
 * Header button for a screen opened without history (web reload, a shared link, the installed
 * web app reopened on a deep page): there is no browser back button in a home-screen app, so it
 * leads to Today instead of leaving the user stuck.
 */
export function HomeFallbackButton() {
  const { t } = useTranslation();
  return <IconButton icon="backArrow" tone="plain" label={t('common.backHome')} onPress={() => router.replace('/')} />;
}
