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
  // Nothing noted yet: a dash, never "0" as if it had been measured.
  const none = intake.eaten + intake.added === 0;
  const eaten = (v: number) => (none ? t('common.noValue') : num(v));
  const energyLabel = none
    ? t('nutrition.nothingA11y', { target: num(targets.calories) })
    : `${num(intake.kcal)} / ${t('common.kcal', { value: num(targets.calories) })}`;

  const macros: {
    key: 'protein' | 'carbs' | 'fat';
    eaten: number;
    target: number;
    color: ColorToken;
  }[] = [
    { key: 'protein', eaten: intake.proteinG, target: targets.proteinG, color: 'macroProtein' },
    { key: 'carbs', eaten: intake.carbsG, target: targets.carbsG, color: 'macroCarbs' },
    { key: 'fat', eaten: intake.fatG, target: targets.fatG, color: 'macroFat' },
  ];

  return (
    <Card style={styles.card}>
      <View style={[styles.hero, compact && styles.heroCompact]}>
        <ProgressRing
          value={energyRatio}
          size={compact ? 108 : 120}
          stroke={10}
          color="primary"
          track="surfaceSubtle"
          label={`${t('nutrition.energy')} : ${energyLabel}`}>
          <Text variant="metric">{eaten(intake.kcal)}</Text>
          <Text variant="caption" color="textMuted">
            / {t('common.kcal', { value: num(targets.calories) })}
          </Text>
        </ProgressRing>

        <View style={styles.macros}>
          {macros.map((macro) => {
            const ratio = macro.target > 0 ? macro.eaten / macro.target : 0;
            const value = `${eaten(macro.eaten)} / ${t('common.grams', { value: num(macro.target) })}`;
            return (
              <View key={macro.key} style={styles.macro}>
                <View style={styles.macroTop}>
                  <Text variant="caption" color="textSecondary">
                    {t(`nutrition.${macro.key}`)}
                  </Text>
                  <Text variant="captionStrong">{value}</Text>
                </View>
                <ProgressBar value={ratio} label={`${t(`nutrition.${macro.key}`)} : ${value}`} color={macro.color} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Icon name="info" size={14} color="textMuted" />
        <Text variant="caption" color="textMuted" style={styles.flex}>
          {none
            ? t('nutrition.nothingYet')
            : remaining > 0
              ? t('nutrition.remaining', { kcal: num(remaining), eaten: intake.eaten, meals: intake.meals })
              : t('nutrition.mealsEaten', { eaten: intake.eaten, meals: intake.meals })}
          {' · '}
          {t('nutrition.estimate')}
        </Text>
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
  card: { gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg + spacing.xs },
  heroCompact: { gap: spacing.md },
  macros: { flex: 1, gap: spacing.md },
  macro: { gap: spacing.xs + spacing.xxs },
  macroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flex: { flex: 1 },
});
