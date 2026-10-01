import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, EmptyState, LoadingScreen, Screen, Text } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaces } from '@/features/places/usePlaces';
import { formatDate } from '@/lib/format';

export default function PlacesScreen() {
  const { t, i18n } = useTranslation();
  const p = usePlaces();
  const { phase } = p;
  const result = phase.kind === 'done' ? phase.result : null;

  return (
    <Screen>
      <Text color="textMuted">{t('places.intro')}</Text>
      {p.currentGym ? <Banner tone="textMuted" message={t('places.currentGym', { name: p.currentGym })} /> : null}
      <ChoiceGroup
        options={[
          { value: 'gym' as const, label: t('places.kinds.gym') },
          { value: 'store' as const, label: t('places.kinds.store') },
        ]}
        selected={[p.placeKind]}
        onToggle={p.switchKind}
      />
      <Card>
        <Text color="textMuted">{t('places.locationWhy')}</Text>
        <Button
          label={t('places.search')}
          onPress={() => void p.search()}
          disabled={phase.kind === 'locating' || phase.kind === 'loading'}
        />
      </Card>

      {phase.kind === 'locating' ? <LoadingScreen message={t('places.locating')} /> : null}
      {phase.kind === 'loading' ? <LoadingScreen message={t('common.loading')} /> : null}
      {phase.kind === 'location_denied' ? <Banner message={t('places.locationDenied')} /> : null}
      {phase.kind === 'location_error' ? <Banner message={t('places.locationError')} /> : null}
      {result?.status === 'unavailable' ? <EmptyState message={t('places.none')} /> : null}
      {result?.status === 'error' ? (
        <Banner message={t(result.error === 'rate_limited' ? 'places.busy' : 'places.error')} />
      ) : null}

      {result?.status === 'ok' ? (
        <>
          {p.hadNoGym && p.placeKind === 'gym' ? <Banner tone="textMuted" message={t('places.equipmentHint')} /> : null}
          {result.data.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              isMine={p.currentGym === place.name}
              onChoose={place.kind === 'gym' ? () => p.chooseGym(place) : undefined}
              onMap={() => void p.openMap(place)}
            />
          ))}
          <Text variant="caption" color="textMuted">
            {t('places.source', {
              source: result.meta.source,
              date: formatDate(toIsoDate(new Date(result.meta.fetchedAt)), i18n.language),
            })}
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
