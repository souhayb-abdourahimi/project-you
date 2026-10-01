import { useTranslation } from 'react-i18next';

import { Button, Card, Row, Text } from '@/components/ui';
import type { Place } from '@/providers/types';

function formatDistance(meters: number, locale: string) {
  return meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

export function PlaceCard({
  place,
  isMine,
  onChoose,
  onMap,
}: {
  place: Place;
  isMine: boolean;
  onChoose?: () => void;
  onMap: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <Text variant="heading">{place.name}</Text>
      <Text color="textMuted">
        {t('places.distance', { distance: formatDistance(place.distanceMeters, i18n.language) })}
      </Text>
      <Text>{place.address ?? t('places.noAddress')}</Text>
      <Text color={place.openingHours ? 'text' : 'textMuted'}>
        {place.openingHours ? t('places.hours', { hours: place.openingHours }) : t('places.noHours')}
      </Text>
      <Row>
        <Button compact variant="secondary" label={t('places.map')} onPress={onMap} />
        {onChoose ? (
          isMine ? (
            <Text color="success">{t('places.isMine')}</Text>
          ) : (
            <Button compact variant="secondary" label={t('places.choose')} onPress={onChoose} />
          )
        ) : null}
      </Row>
    </Card>
  );
}
