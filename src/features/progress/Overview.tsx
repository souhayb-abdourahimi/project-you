import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, ProgressRing, Text, TrendLine } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

import { weightTrend } from './view';

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/**
 * The two tiles at the top of "Mon évolution" (W-10 reference): the body measure the goal puts
 * first (waist before weight in recomposition, docs/PROGRESS_JOURNEY.md §3) with its real weekly
 * line, and session adherence as a ring. A missing measure says so; nothing is drawn from zero.
 */
export function ProgressOverview({
  progress,
  today,
  rangeWeeks,
}: {
  progress: ProgressJourney;
  today: string;
  rangeWeeks: number;
}) {
  return (
    <View style={styles.row}>
      <BodyTile progress={progress} today={today} rangeWeeks={rangeWeeks} />
      <AdherenceTile progress={progress} />
    </View>
  );
}

function BodyTile({ progress, today, rangeWeeks }: { progress: ProgressJourney; today: string; rangeWeeks: number }) {
  const { t } = useTranslation();
  const weights = useDataStore((s) => s.weights);
  const { weight, waist } = progress.body;
  const first = progress.bodyOrder.find(
    (b) => (b === 'waist' && waist) || (b === 'weight' && weight?.currentAvgKg != null),
  );
  if (first === 'waist' && waist) {
    const value = t('progress.body.cm', { value: waist.currentCm });
    const change = waist.changeCm === null ? null : t('progress.overview.cmChange', { change: signed(waist.changeCm) });
    return (
      <Tile
        icon="weight"
        title={t('progress.body.waist')}
        a11y={[t('progress.body.waist'), value, change].filter(Boolean).join(', ')}>
        <Text variant="metric">{value}</Text>
        {change ? (
          <Text variant="captionStrong" color="textSecondary">
            {change}
          </Text>
        ) : null}
      </Tile>
    );
  }
  if (weight && weight.currentAvgKg !== null) {
    const trend = weightTrend(weights, today, rangeWeeks);
    const value = t('common.mass', { value: weight.currentAvgKg });
    const change =
      weight.changeKg === null ? null : t('progress.overview.kgChange', { change: signed(weight.changeKg) });
    const known = trend?.weeks.filter((w) => w.kg !== null) ?? [];
    return (
      <Tile
        icon="weight"
        title={t('progress.overview.weight')}
        a11y={[t('progress.overview.weight'), value, change].filter(Boolean).join(', ')}>
        <Text variant="metric">{value}</Text>
        {change ? (
          <Text variant="captionStrong" color="textSecondary">
            {change}
          </Text>
        ) : null}
        {trend && known.length >= 2 ? (
          <TrendLine
            values={trend.weeks.map((w) => w.kg)}
            color="primary"
            height={34}
            label={t('progress.body.trendA11y', {
              count: known.length,
              first: t('common.mass', { value: known[0].kg }),
              last: t('common.mass', { value: known[known.length - 1].kg }),
            })}
          />
        ) : (
          <Text variant="caption" color="textMuted">
            {t('progress.overview.notEnoughWeights')}
          </Text>
        )}
      </Tile>
    );
  }
  return (
    <Tile
      icon="weight"
      title={t('progress.overview.weight')}
      a11y={`${t('progress.overview.weight')}, ${t('common.unavailable')}`}>
      <Text variant="headline" color="textMuted">
        {t('common.unavailable')}
      </Text>
      <Text variant="caption" color="textMuted">
        {t('progress.overview.noWeight')}
      </Text>
    </Tile>
  );
}

function AdherenceTile({ progress }: { progress: ProgressJourney }) {
  const { t } = useTranslation();
  const sessions = progress.sinceStart.adherence?.sessions;
  if (!sessions || sessions.planned === 0) {
    return (
      <Tile
        icon="sessions"
        title={t('progress.overview.adherence')}
        a11y={`${t('progress.overview.adherence')}, ${t('progress.overview.notEnoughSessions')}`}>
        <Text variant="caption" color="textMuted">
          {t('progress.overview.notEnoughSessions')}
        </Text>
      </Tile>
    );
  }
  const done = sessions.done + sessions.adapted;
  const ratio = Math.min(1, done / sessions.planned);
  const caption = t('progress.overview.sessions', { done, planned: sessions.planned });
  const full = `${caption}, ${t('progress.overview.window')}`;
  return (
    <Tile
      icon="sessions"
      title={t('progress.overview.adherence')}
      a11y={`${t('progress.overview.adherence')}, ${Math.round(ratio * 100)} %, ${full}`}>
      {/* Ring above its caption: side by side, the caption wrapped word by word on an iPhone SE. */}
      <ProgressRing value={ratio} size={56} stroke={6} color="primary" label={full}>
        <Text variant="captionStrong">{Math.round(ratio * 100)}%</Text>
      </ProgressRing>
      <View>
        <Text variant="captionStrong">{caption}</Text>
        <Text variant="caption" color="textMuted">
          {t('progress.overview.window')}
        </Text>
      </View>
    </Tile>
  );
}

function Tile({
  icon,
  title,
  a11y,
  children,
}: {
  icon: 'weight' | 'sessions';
  title: string;
  a11y: string;
  children: ReactNode;
}) {
  return (
    <Card dense style={styles.tile} accessibilityLabel={a11y}>
      <View style={styles.head} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={icon} size="sm" color={icon === 'weight' ? 'progress' : 'training'} />
        <Text variant="captionStrong" color="textSecondary" numberOfLines={1} style={styles.flex}>
          {title}
        </Text>
      </View>
      <View style={styles.body} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flex: 1, minWidth: 150, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  body: { gap: spacing.xs },
  flex: { flex: 1 },
});
