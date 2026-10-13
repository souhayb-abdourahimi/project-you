import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, ProgressBar, ProgressRing, Rationale, Text } from '@/components/ui';
import type { NutritionTargets } from '@/domain/nutrition/engine';
import { formatNumber } from '@/lib/format';
import { radius, spacing, useColors, useCompact, type ColorToken } from '@/theme';

import type { DayIntake } from './view';

/**
 * Premium daily nutrition summary.
 *
 * All values come from meals explicitly marked as eaten. Missing or replaced meals are never
 * guessed. Targets remain estimates from the nutrition engine and are labelled as such.
 */
export function DayTargets({ targets, intake }: { targets: NutritionTargets; intake: DayIntake }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const compact = useCompact();
  const num = (v: number) => formatNumber(v, i18n.language);

  const energyRatio = targets.calories > 0 ? intake.kcal / targets.calories : 0;
  const remaining = Math.max(0, Math.round(targets.calories - intake.kcal));
  const energyLabel = `${num(intake.kcal)} / ${t('common.kcal', { value: num(targets.calories) })}`;

  const macros: {
    key: 'protein' | 'carbs' | 'fat';
    eaten: number;
    target: number;
    color: ColorToken;
  }[] = [
    { key: 'protein', eaten: intake.proteinG, target: targets.proteinG, color: 'nutrition' },
    { key: 'carbs', eaten: intake.carbsG, target: targets.carbsG, color: 'primary' },
    { key: 'fat', eaten: intake.fatG, target: targets.fatG, color: 'progress' },
  ];

  return (
    <Card raised style={styles.card}>
      <View style={styles.heading}>
        <View style={[styles.iconWell, { backgroundColor: colors.successSubtle }]}>
          <Icon name="nutrition" size="md" color="nutrition" />
        </View>
        <View style={styles.flex}>
          <Text variant="headline">{t('nutrition.targets')}</Text>
          <Text variant="caption" color="textMuted">
            {t('nutrition.targetsHint')}
          </Text>
        </View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <ProgressRing
          value={energyRatio}
          size={compact ? 124 : 144}
          stroke={11}
          color="nutrition"
          track="surfaceSubtle"
          label={`${t('nutrition.energy')} : ${energyLabel}`}>
          <Text variant={compact ? 'title1' : 'metricLarge'}>{num(intake.kcal)}</Text>
          <Text variant="captionStrong" color="textMuted">
            kcal
          </Text>
        </ProgressRing>

        <View style={styles.energyCopy}>
          <Text variant="overline" color="nutrition">
            {t('nutrition.energy')}
          </Text>
          <Text variant="title2">
            {remaining > 0 ? t('common.kcal', { value: num(remaining) }) : t('nutrition.eaten')}
          </Text>
          <Text variant="caption" color="textMuted">
            {remaining > 0
              ? `${t('nutrition.mealsEaten', { eaten: intake.eaten, meals: intake.meals })} · ${energyLabel}`
              : energyLabel}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.macros}>
        {macros.map((macro) => {
          const ratio = macro.target > 0 ? macro.eaten / macro.target : 0;
          const value = `${num(macro.eaten)} / ${num(macro.target)} g`;
          return (
            <View key={macro.key} style={styles.macro}>
              <View style={styles.macroTop}>
                <Text variant="captionStrong" color="textSecondary">
                  {t(`nutrition.${macro.key}`)}
                </Text>
                <Text variant="captionStrong">{value}</Text>
              </View>
              <ProgressBar
                value={ratio}
                label={`${t(`nutrition.${macro.key}`)} : ${value}`}
                color={macro.color}
              />
            </View>
          );
        })}
      </View>

      {targets.warnings.map((warning) => (
        <View key={warning} style={[styles.warning, { backgroundColor: colors.warningSubtle }]}>
          <Icon name="info" size="sm" color="warning" />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {t(`nutrition.warnings.${warning}`)}
          </Text>
        </View>
      ))}

      <Rationale data={targets.rationale} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg, overflow: 'hidden' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  heroCompact: {
    gap: spacing.lg,
  },
  energyCopy: { flex: 1, gap: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(93, 102, 118, 0.18)' },
  macros: { gap: spacing.md },
  macro: { gap: spacing.xs },
  macroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flex: { flex: 1 },
});
