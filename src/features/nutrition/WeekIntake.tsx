import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, MiniBars, ProgressBar, Text } from '@/components/ui';
import type { LoggedMeal } from '@/domain/meals/photo-analysis';
import type { DailyMealPlan } from '@/domain/meals/planner';
import type { NutritionTargets } from '@/domain/nutrition/engine';
import { formatDate, formatNumber } from '@/lib/format';
import { radius, spacing, useColors } from '@/theme';

import { dayIntake } from './view';

/**
 * The week of meals (Nutrition › Semaine): only meals explicitly marked eaten count. A day without
 * any eaten meal is unknown, never a zero bar (docs/W9_NUTRITION_PREMIUM_HANDOFF.md).
 */
export function WeekIntake({
  days,
  targets,
  added,
}: {
  days: readonly DailyMealPlan[];
  targets: NutritionTargets;
  added: readonly LoggedMeal[];
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const num = (v: number) => formatNumber(Math.round(v), i18n.language);
  if (days.length === 0) return <EmptyState icon="meal" message={t('common.loading')} />;

  const intakes = days.map((day) => ({
    day,
    intake: dayIntake(
      day.meals,
      added.filter((m) => m.date === day.date),
    ),
  }));
  const known = intakes.map(({ intake }) => (intake.eaten + intake.added > 0 ? intake.kcal : null));
  const knownDays = known.filter((v) => v !== null).length;
  const summary = t('nutrition.weekSummary', { days: knownDays, total: days.length });

  return (
    <View style={styles.stack}>
      <Card style={styles.summary}>
        <Text variant="captionStrong" color="textSecondary">
          {t('nutrition.energy')}
        </Text>
        <MiniBars values={known} label={summary} color="primary" height={56} />
        <Text variant="caption" color="textMuted">
          {summary} · {t('nutrition.weekEatenOnly')}
        </Text>
      </Card>

      {intakes.map(({ day, intake }) => {
        const marked = day.meals.filter((meal) => meal.status !== 'planned').length;
        const kcalRatio = targets.calories > 0 ? intake.kcal / targets.calories : 0;
        const proteinRatio = targets.proteinG > 0 ? intake.proteinG / targets.proteinG : 0;
        return (
          <Card key={day.date} dense style={styles.day}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text variant="headline">{formatDate(day.date, i18n.language)}</Text>
                <Text variant="caption" color="textMuted">
                  {t('nutrition.mealsEaten', { eaten: intake.eaten, meals: intake.meals })}
                </Text>
              </View>
              {intake.eaten + intake.added > 0 ? (
                <Text variant="captionStrong">
                  {num(intake.kcal)} / {t('common.kcal', { value: num(targets.calories) })}
                </Text>
              ) : null}
            </View>

            {intake.eaten + intake.added > 0 ? (
              <>
                <Metric
                  label={t('nutrition.energy')}
                  value={`${Math.round(Math.min(1, kcalRatio) * 100)} %`}
                  ratio={kcalRatio}
                  color="macroCarbs"
                />
                <Metric
                  label={t('nutrition.protein')}
                  value={`${num(intake.proteinG)} / ${num(targets.proteinG)} g`}
                  ratio={proteinRatio}
                  color="macroProtein"
                />
              </>
            ) : (
              <View style={[styles.unknown, { backgroundColor: colors.surfaceSubtle }]}>
                <Text variant="captionStrong" color="textSecondary">
                  {marked > 0 ? t('nutrition.weekUnknownIntake') : t('nutrition.weekNoMeals')}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t('nutrition.weekNeverZero')}
                </Text>
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}

function Metric({
  label,
  value,
  ratio,
  color,
}: {
  label: string;
  value: string;
  ratio: number;
  color: 'macroCarbs' | 'macroProtein';
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="captionStrong">{value}</Text>
      </View>
      <ProgressBar value={ratio} label={`${label} : ${value}`} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm + spacing.xxs },
  summary: { gap: spacing.sm },
  day: { gap: spacing.sm + spacing.xxs },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  metric: { gap: spacing.xs },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  unknown: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  flex: { flex: 1 },
});
