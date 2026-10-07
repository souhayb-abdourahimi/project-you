import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Section, Text, TrendLine } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { MassField, NumberField } from '@/features/onboarding/fields';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

import { weightTrend } from './view';

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/**
 * The body, measured only (W-9 §7): the waist and the weight in the goal's order, the weekly
 * weight averages as a quiet line when at least two weeks are known, then the quick entry.
 */
export function BodyProgress({
  progress,
  recomposition,
  today,
}: {
  progress: ProgressJourney;
  recomposition: boolean;
  today: string;
}) {
  const { t } = useTranslation();
  const weights = useDataStore((s) => s.weights);
  const { weight, waist, others } = progress.body;
  const trend = weight ? weightTrend(weights, today) : null;
  const blocks: ReactNode[] = [];
  // Measures the user records but the goal does not put forward still show, after the others.
  const order = [
    ...progress.bodyOrder,
    ...(['waist', 'weight'] as const).filter((b) => !progress.bodyOrder.includes(b)),
  ];
  for (const block of order) {
    if (block === 'waist' && waist) {
      blocks.push(
        <View key="waist" style={styles.block}>
          <Text variant="captionStrong" color="textSecondary">
            {t('progress.body.waist')}
          </Text>
          <Text variant="metric">{t('progress.body.cm', { value: waist.currentCm })}</Text>
          {waist.changeCm !== null ? (
            <Text color="textSecondary">
              {t('progress.body.sinceStartCm', { change: signed(waist.changeCm), start: waist.startCm })}
            </Text>
          ) : null}
        </View>,
      );
    }
    if (block === 'weight' && weight) {
      // In recomposition the scale is secondary: smaller, last (§3).
      const known = trend?.weeks.filter((w) => w.kg !== null) ?? [];
      blocks.push(
        <View key="weight" style={styles.block}>
          <Text variant="captionStrong" color="textSecondary">
            {t('progress.body.weight')}
          </Text>
          <Text variant={recomposition ? 'headline' : 'metric'}>
            {weight.currentAvgKg === null ? t('common.unavailable') : t('common.mass', { value: weight.currentAvgKg })}
          </Text>
          <Text color="textSecondary" variant={recomposition ? 'caption' : 'body'}>
            {weight.changeKg === null
              ? t('progress.body.notYetComparable')
              : t('progress.body.sinceStartKg', { change: signed(weight.changeKg), start: weight.startAvgKg })}
          </Text>
          {trend && !recomposition ? (
            <View style={styles.trend}>
              <TrendLine
                values={trend.weeks.map((w) => w.kg)}
                color="progress"
                label={t('progress.body.trendA11y', {
                  count: known.length,
                  first: t('common.mass', { value: known[0].kg }),
                  last: t('common.mass', { value: known[known.length - 1].kg }),
                })}
              />
              <Text variant="caption" color="textMuted">
                {t('progress.body.trendCaption', { count: trend.weeks.length })}
              </Text>
            </View>
          ) : null}
        </View>,
      );
    }
  }
  for (const m of others) {
    blocks.push(
      <Text key={m.kind}>
        {t('progress.body.other', {
          kind: t(`progress.measure.${m.kind}`, { defaultValue: m.kind }),
          value: m.currentCm,
          change: m.changeCm === null ? '' : ` (${signed(m.changeCm)} cm)`,
        })}
      </Text>,
    );
  }
  return (
    <Section title={t('progress.body.title')}>
      {blocks.length > 0 ? <Card style={styles.card}>{blocks}</Card> : null}
      <QuickEntry today={today} />
    </Section>
  );
}

/** A weigh-in or a waist measurement, in one gesture. */
function QuickEntry({ today }: { today: string }) {
  const { t } = useTranslation();
  const logWeight = useDataStore((s) => s.logWeight);
  const logWaist = useDataStore((s) => s.logWaist);
  const [weight, setWeight] = useState<number | undefined>();
  const [waistCm, setWaistCm] = useState<number | undefined>();
  const [formKey, setFormKey] = useState(0);
  return (
    <Card tone="subtle" style={styles.card}>
      <View style={styles.title}>
        <Icon name="weight" size="sm" color="progress" />
        <Text variant="headline">{t('progress.quickEntry')}</Text>
      </View>
      <MassField
        key={`w${formKey}`}
        label={(unit) => t('onboarding.profile.body.weight', { unit })}
        valueKg={weight}
        onChange={setWeight}
      />
      <Button
        label={t('progress.logWeight')}
        disabled={!weight || weight < 25 || weight > 400}
        onPress={() => {
          if (weight) logWeight(today, weight);
          setWeight(undefined);
          setFormKey((k) => k + 1);
        }}
      />
      <NumberField key={`c${formKey}`} label={t('progress.waist')} value={waistCm} onChange={setWaistCm} />
      <Button
        variant="secondary"
        label={t('progress.logWaist')}
        disabled={!waistCm || waistCm < 10 || waistCm > 300}
        onPress={() => {
          if (waistCm) logWaist(today, waistCm);
          setWaistCm(undefined);
          setFormKey((k) => k + 1);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  block: { gap: spacing.xxs },
  trend: { gap: spacing.xs, marginTop: spacing.md },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
