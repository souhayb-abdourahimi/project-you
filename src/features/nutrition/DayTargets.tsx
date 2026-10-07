import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Banner, Card, Icon, ProgressBar, Rationale, Text } from '@/components/ui';
import type { NutritionTargets } from '@/domain/nutrition/engine';
import { formatNumber } from '@/lib/format';
import { spacing, type ColorToken } from '@/theme';

import type { DayIntake } from './view';

/**
 * The day's targets (W-9 §6): energy first, then the three macros, each "meals marked eaten /
 * target". Every number is an estimate and says so; a passed target stays a full bar, never red.
 */
export function DayTargets({ targets, intake }: { targets: NutritionTargets; intake: DayIntake }) {
  const { t, i18n } = useTranslation();
  const num = (v: number) => formatNumber(v, i18n.language);
  const energy = `${num(intake.kcal)} / ${t('common.kcal', { value: num(targets.calories) })}`;
  const macros: { key: 'protein' | 'carbs' | 'fat'; eaten: number; target: number; color: ColorToken }[] = [
    { key: 'protein', eaten: intake.proteinG, target: targets.proteinG, color: 'nutrition' },
    { key: 'carbs', eaten: intake.carbsG, target: targets.carbsG, color: 'primary' },
    { key: 'fat', eaten: intake.fatG, target: targets.fatG, color: 'progress' },
  ];
  return (
    <Card raised style={styles.card}>
      <View style={styles.inline}>
        <Icon name="nutrition" size="sm" color="nutrition" />
        <Text variant="headline">{t('nutrition.targets')}</Text>
      </View>
      <View>
        <Text variant="metricLarge" accessibilityLabel={`${t('nutrition.energy')} : ${energy}`}>
          {num(intake.kcal)}
        </Text>
        <Text variant="captionStrong" color="textMuted">
          / {t('common.kcal', { value: num(targets.calories) })} ·{' '}
          {t('nutrition.mealsEaten', { eaten: intake.eaten, meals: intake.meals })}
        </Text>
      </View>
      <ProgressBar
        value={intake.kcal / targets.calories}
        label={`${t('nutrition.energy')} : ${energy}`}
        color="nutrition"
      />
      <View style={styles.macros}>
        {macros.map((m) => {
          const value = `${num(m.eaten)} / ${t('common.grams', { value: num(m.target) })}`;
          return (
            <View key={m.key} style={styles.macro}>
              <Text variant="captionStrong" color="textSecondary">
                {t(`nutrition.${m.key}`)}
              </Text>
              <Text variant="bodyMedium">{value}</Text>
              <ProgressBar
                value={m.target > 0 ? m.eaten / m.target : 0}
                label={`${t(`nutrition.${m.key}`)} : ${value}`}
                color={m.color}
              />
            </View>
          );
        })}
      </View>
      <Text variant="caption" color="textMuted">
        {t('nutrition.targetsHint')}
      </Text>
      {targets.warnings.map((w) => (
        <Banner key={w} message={t(`nutrition.warnings.${w}`)} />
      ))}
      <Rationale data={targets.rationale} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  macros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  macro: { flex: 1, minWidth: 90, gap: spacing.xs },
});
