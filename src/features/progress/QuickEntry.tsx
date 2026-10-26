import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { MassField, NumberField } from '@/features/onboarding/fields';
import { useDataStore } from '@/state/data';
import { MIN_TOUCH, spacing } from '@/theme';

/** A weigh-in or a waist measurement, in one gesture. */
/**
 * `fixed`: always open, without the fold control (the web Health screen, where entering is the
 * point). Buttons say "Noter" next to their labelled field; screen readers hear the full action.
 */
export function QuickEntry({
  today,
  initiallyOpen,
  fixed = false,
}: {
  today: string;
  initiallyOpen: boolean;
  fixed?: boolean;
}) {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(initiallyOpen);
  const open = fixed || isOpen;
  const logWeight = useDataStore((s) => s.logWeight);
  const logWaist = useDataStore((s) => s.logWaist);
  const [weight, setWeight] = useState<number | undefined>();
  const [waistCm, setWaistCm] = useState<number | undefined>();
  const [formKey, setFormKey] = useState(0);
  // What was just recorded, said once (the screen reader hears it too).
  const [saved, setSaved] = useState<'weight' | 'waist' | null>(null);
  return (
    <Card tone="subtle" style={styles.card}>
      {fixed ? (
        <View style={styles.title}>
          <Icon name="weight" size="sm" color="progress" />
          <Text variant="headline" accessibilityRole="header">
            {t('progress.quickEntry')}
          </Text>
        </View>
      ) : (
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
      )}
      {open ? (
        <>
          <View style={styles.entry}>
            <View style={styles.field}>
              <MassField
                key={`w${formKey}`}
                label={(unit) => t('onboarding.profile.body.weight', { unit })}
                valueKg={weight}
                onChange={(v) => {
                  setWeight(v);
                  setSaved(null);
                }}
              />
            </View>
            <Button
              compact
              label={t('progress.log')}
              accessibilityLabel={t('progress.logWeight')}
              disabled={!weight || weight < 25 || weight > 400}
              onPress={() => {
                if (weight) logWeight(today, weight);
                setSaved('weight');
                setWeight(undefined);
                setFormKey((k) => k + 1);
              }}
            />
          </View>
          <View style={styles.entry}>
            <View style={styles.field}>
              <NumberField
                key={`c${formKey}`}
                label={t('progress.waist')}
                value={waistCm}
                onChange={(v) => {
                  setWaistCm(v);
                  setSaved(null);
                }}
              />
            </View>
            <Button
              compact
              variant="secondary"
              label={t('progress.log')}
              accessibilityLabel={t('progress.logWaist')}
              disabled={!waistCm || waistCm < 10 || waistCm > 300}
              onPress={() => {
                if (waistCm) logWaist(today, waistCm);
                setSaved('waist');
                setWaistCm(undefined);
                setFormKey((k) => k + 1);
              }}
            />
          </View>
          {saved ? (
            <Text variant="caption" color="success" accessibilityLiveRegion="polite">
              {t(saved === 'weight' ? 'progress.savedWeight' : 'progress.savedWaist')}
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  entry: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  field: { flex: 1, minWidth: 150 },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  flex: { flex: 1 },
});
