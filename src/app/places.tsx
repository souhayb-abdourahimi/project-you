import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Banner, Button, Card, ChoiceGroup, EmptyState, LoadingScreen, Screen, Text } from '@/components/ui';
import { toIsoDate } from '@/domain/shared/dates';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaces } from '@/features/places/usePlaces';
import { formatDate } from '@/lib/format';

/** One message per real cause: "check your connection" only when the device is offline. */
function placesErrorKey(error: string): 'offline' | 'timeout' | 'busy' | 'unreachable' | 'service' {
  switch (error) {
    case 'offline':
      return 'offline';
    case 'timeout':
      return 'timeout';
    case 'rate_limited':
      return 'busy';
    case 'network':
      return 'unreachable';
    default:
      return 'service';
  }
}

function ErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text>{message}</Text>
      </View>
      <Button variant="secondary" label={t('common.retry')} onPress={onRetry} />
    </Card>
  );
}

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
        single
        label={t('places.kindLabel')}
        options={[
          { value: 'gym' as const, label: t('places.kinds.gym') },
          { value: 'store' as const, label: t('places.kinds.store') },
        ]}
        selected={[p.placeKind]}
        onToggle={p.switchKind}
      />
      <Card>
        <Text color="textMuted">{t('places.locationWhy')}</Text>
        <Button label={t('places.search')} onPress={() => void p.search()} disabled={p.busy} />
      </Card>

      {phase.kind === 'locating' ? <LoadingScreen message={t('places.locating')} /> : null}
      {phase.kind === 'loading' ? <LoadingScreen message={t('common.loading')} /> : null}
      {phase.kind === 'location_denied' ? <Banner message={t(p.deniedMessage)} /> : null}
      {phase.kind === 'location_error' ? (
        <ErrorWithRetry
          message={t(phase.reason === 'timeout' ? 'places.locationTimeout' : 'places.locationError')}
          onRetry={() => void p.search()}
        />
      ) : null}
      {result?.status === 'unavailable' ? (
        <EmptyState message={t(`places.none.${p.placeKind}`, { radius: p.radiusKm })} />
      ) : null}
      {result?.status === 'error' ? (
        <ErrorWithRetry message={t(`places.errors.${placesErrorKey(result.error)}`)} onRetry={() => void p.search()} />
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
