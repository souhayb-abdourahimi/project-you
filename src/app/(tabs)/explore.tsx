import { useTranslation } from 'react-i18next';

import { Banner, Card, Screen, Text } from '@/components/ui';

/** Phase 2: PlacesProvider. Until a real provider exists, nothing is shown rather than invented data. */
export default function ExploreScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Text variant="display">{t('explore.title')}</Text>
      <Text color="textMuted">{t('explore.subtitle')}</Text>
      <Banner message={t('explore.unavailable')} />
      <Card muted>
        <Text variant="label">{t('explore.categories')}</Text>
        <Text color="textMuted">{t('explore.categoryList')}</Text>
      </Card>
    </Screen>
  );
}
