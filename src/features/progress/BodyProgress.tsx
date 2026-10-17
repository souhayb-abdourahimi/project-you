import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Section, Text, TrendLine } from '@/components/ui';
import type { ProgressJourney } from '@/domain/journey/progress-journey';
import { MassField, NumberField } from '@/features/onboarding/fields';
import { useDataStore } from '@/state/data';
import { MIN_TOUCH, spacing } from '@/theme';

import { weightTrend } from './view';

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/**
 * The body, measured only (W-9 §7): the waist and the weight in the goal's order, each as a label
 * and its value on one line with the change below; the weekly weight averages as a line when at
 * least two weeks are known; then the quick entry, folded into one row unless nothing is measured
 * yet or the user came here to log (`entryOpen`).
 */
export function BodyProgress({
  progress,
  recomposition,
  today,
  rangeWeeks,
  entryOpen,
}: {
  progress: ProgressJourney;
  recomposition: boolean;
  today: string;
  rangeWeeks?: number;
  entryOpen?: boolean;
}) {
  const { t } = useTranslation();
  const weights = useDataStore((s) => s.weights);
  const { weight, waist, others } = progress.body;
  const trend = weight ? weightTrend(weights, today, rangeWeeks) : null;
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
          <View style={styles.measure}>
            <Text variant="captionStrong" color="textSecondary" style={styles.flex}>
              {t('progress.body.waist')}
            </Text>
            <Text variant="title2">{t('progress.body.cm', { value: waist.currentCm })}</Text>
          </View>
          {waist.changeCm !== null ? (
            <Text variant="caption" color="textSecondary">
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
          <View style={styles.measure}>
            <Text variant="captionStrong" color="textSecondary" style={styles.flex}>
              {t('progress.body.weight')}
            </Text>
            <Text
              variant={recomposition ? 'headline' : 'title2'}
              color={weight.currentAvgKg === null ? 'textMuted' : undefined}>
              {weight.currentAvgKg === null
                ? t('common.unavailable')
                : t('common.mass', { value: weight.currentAvgKg })}
            </Text>
          </View>
          <Text color="textSecondary" variant="caption">
            {weight.changeKg === null
              ? t('progress.body.notYetComparable')
              : t('progress.body.sinceStartKg', { change: signed(weight.changeKg), start: weight.startAvgKg })}
          </Text>
          {trend && !recomposition ? (
            <View style={styles.trend}>
              <TrendLine
                values={trend.weeks.map((w) => w.kg)}
                color="primary"
                height={88}
                axis={{
                  max: t('common.mass', { value: Math.max(...known.map((w) => w.kg!)) }),
                  min: t('common.mass', { value: Math.min(...known.map((w) => w.kg!)) }),
                  start: t('progress.body.weeksAgo', { count: trend.weeks.length - 1 }),
                  end: t('progress.body.thisWeek'),
                }}
                label={t('progress.body.trendA11y', {
                  count: known.length,
                  first: t('common.mass', { value: known[0].kg }),
                  last: t('common.mass', { value: known[known.length - 1].kg }),
                })}
              />
            </View>
          ) : !recomposition && weight.entries > 0 ? (
            <Text variant="caption" color="textMuted">
              {t('progress.body.notEnoughTrend')}
            </Text>
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
      <QuickEntry today={today} initiallyOpen={entryOpen || (!weight && !waist)} />
    </Section>
  );
}

/** A weigh-in or a waist measurement, in one gesture. */
function QuickEntry({ today, initiallyOpen }: { today: string; initiallyOpen: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const logWeight = useDataStore((s) => s.logWeight);
  const logWaist = useDataStore((s) => s.logWaist);
  const [weight, setWeight] = useState<number | undefined>();
  const [waistCm, setWaistCm] = useState<number | undefined>();
  const [formKey, setFormKey] = useState(0);
  return (
    <Card tone="subtle" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('progress.quickEntry')}
        accessibilityHint={t('progress.quickEntryHint')}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={styles.title}>
        <Icon name="weight" size="sm" color="progress" />
        <View style={styles.flex}>
          <Text variant="headline">{t('progress.quickEntry')}</Text>
          {open ? null : (
            <Text variant="caption" color="textMuted">
              {t('progress.quickEntryHint')}
            </Text>
          )}
        </View>
        <Icon name={open ? 'close' : 'plus'} size="sm" color="primary" />
      </Pressable>
      {open ? (
        <>
          <View style={styles.entry}>
            <View style={styles.field}>
              <MassField
                key={`w${formKey}`}
                label={(unit) => t('onboarding.profile.body.weight', { unit })}
                valueKg={weight}
                onChange={setWeight}
              />
            </View>
            <Button
              compact
              label={t('progress.logWeight')}
              disabled={!weight || weight < 25 || weight > 400}
              onPress={() => {
                if (weight) logWeight(today, weight);
                setWeight(undefined);
                setFormKey((k) => k + 1);
              }}
            />
          </View>
          <View style={styles.entry}>
            <View style={styles.field}>
              <NumberField key={`c${formKey}`} label={t('progress.waist')} value={waistCm} onChange={setWaistCm} />
            </View>
            <Button
              compact
              variant="secondary"
              label={t('progress.logWaist')}
              disabled={!waistCm || waistCm < 10 || waistCm > 300}
              onPress={() => {
                if (waistCm) logWaist(today, waistCm);
                setWaistCm(undefined);
                setFormKey((k) => k + 1);
              }}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  entry: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  field: { flex: 1, minWidth: 150 },
  block: { gap: spacing.xxs },
  trend: { gap: spacing.xs, marginTop: spacing.md },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  measure: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  flex: { flex: 1 },
});
