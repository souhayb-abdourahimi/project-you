import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  ActionCard,
  Banner,
  Card,
  ChoiceGroup,
  EmptyState,
  LoadingScreen,
  ProgressBar,
  Screen,
  ScreenHeader,
  Section,
  Text,
} from '@/components/ui';
import { getRecipe } from '@/domain/meals/recipes';
import { BudgetCard } from '@/features/nutrition/BudgetCard';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { DayTargets } from '@/features/nutrition/DayTargets';
import { ExclusionSummary } from '@/features/nutrition/ExclusionSummary';
import { MealCard } from '@/features/nutrition/MealCard';
import { MealMedia } from '@/features/nutrition/MealMedia';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { dayIntake } from '@/features/nutrition/view';
import { usePlan } from '@/hooks/usePlan';
import { formatDate } from '@/lib/format';
import { radius, spacing, useColors } from '@/theme';

type NutritionView = 'day' | 'week' | 'recipes';

export default function NutritionScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const plan = usePlan();
  const [view, setView] = useState<NutritionView>('day');

  if (!plan) return <LoadingScreen />;

  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const labels =
    lang === 'fr'
      ? { day: 'Jour', week: 'Semaine', recipes: 'Recettes', plannedRecipes: 'Recettes de ton plan' }
      : { day: 'Day', week: 'Week', recipes: 'Recipes', plannedRecipes: 'Recipes in your plan' };

  const { targets } = plan;
  const today = plan.mealPlan?.days.find((day) => day.date === plan.today);
  const intake = dayIntake(today?.meals);
  const days = plan.mealPlan?.days ?? [];

  const recipeIds = [...new Set(days.flatMap((day) => day.meals.map((meal) => meal.recipeId)))];
  const recipes = recipeIds.flatMap((id) => {
    const recipe = getRecipe(id);
    return recipe ? [recipe] : [];
  });

  return (
    <Screen airy>
      <ScreenHeader subtitle={formatDate(plan.today, i18n.language)} title={t('nutrition.title')} />

      <ChoiceGroup
        single
        label={t('nutrition.title')}
        options={[
          { value: 'day', label: labels.day },
          { value: 'week', label: labels.week },
          { value: 'recipes', label: labels.recipes },
        ]}
        selected={[view]}
        onToggle={(value: NutritionView) => setView(value)}
      />

      {view === 'day' ? (
        <>
          <DayTargets targets={targets} intake={intake} />

          <View style={styles.quickActions}>
            <View style={styles.quickAction}>
              <ActionCard
                icon="meal"
                iconColor="nutrition"
                title={t('nutrition.inventory')}
                onPress={() => router.push('/inventory')}
              />
            </View>
            <View style={styles.quickAction}>
              <ActionCard
                icon="shopping"
                iconColor="nutrition"
                title={t('nutrition.shopping')}
                onPress={() => router.push('/shopping')}
              />
            </View>
          </View>

          {plan.snapshot.nutrition.excludedFoods.length + plan.snapshot.nutrition.intolerances.length > 0 ? (
            <Card muted>
              <ExclusionSummary
                excluded={plan.snapshot.nutrition.excludedFoods}
                intolerances={plan.snapshot.nutrition.intolerances}
              />
            </Card>
          ) : null}

          <Section
            title={t('today.meals')}
            right={
              <Text variant="captionStrong" color="textMuted">
                {t('nutrition.mealsEaten', { eaten: intake.eaten, meals: intake.meals })}
              </Text>
            }>
            <DayEnergyWarning day={today} />

            {today?.protein ? (
              <Text variant="caption" color="textMuted">
                {t('nutrition.proteinPlanned', {
                  planned: today.protein.plannedG,
                  target: today.protein.targetG,
                })}
              </Text>
            ) : null}

            {plan.mealPlan?.diagnosis ? (
              <PlanDiagnosisCard diagnosis={plan.mealPlan.diagnosis} />
            ) : today?.protein && !today.protein.met ? (
              <Banner message={t('nutrition.proteinShort')} />
            ) : null}

            <View style={styles.mealStack}>
              {today ? (
                today.meals.map((meal) => <MealCard key={meal.id} meal={meal} />)
              ) : (
                <Text color="textMuted">{t('common.loading')}</Text>
              )}
            </View>

            <Text variant="caption" color="textMuted">
              {t('nutrition.source')}
            </Text>
          </Section>

          <BudgetCard />
        </>
      ) : null}

      {view === 'week' ? (
        <Section title={labels.week}>
          {days.length > 0 ? (
            <View style={styles.weekStack}>
              {days.map((day) => {
                const daily = dayIntake(day.meals);
                const kcalRatio = targets.calories > 0 ? daily.kcal / targets.calories : 0;
                const proteinRatio = targets.proteinG > 0 ? daily.proteinG / targets.proteinG : 0;
                return (
                  <Card key={day.date} dense style={styles.weekCard}>
                    <View style={styles.weekHeader}>
                      <View style={styles.flex}>
                        <Text variant="headline">{formatDate(day.date, i18n.language)}</Text>
                        <Text variant="caption" color="textMuted">
                          {t('nutrition.mealsEaten', { eaten: daily.eaten, meals: daily.meals })}
                        </Text>
                      </View>
                      <Text variant="captionStrong">
                        {Math.round(daily.kcal)} / {Math.round(targets.calories)} kcal
                      </Text>
                    </View>

                    <View style={styles.weekMetric}>
                      <View style={styles.weekMetricTop}>
                        <Text variant="captionStrong" color="textSecondary">
                          {t('nutrition.energy')}
                        </Text>
                        <Text variant="caption" color="textMuted">
                          {Math.round(Math.min(1, kcalRatio) * 100)}%
                        </Text>
                      </View>
                      <ProgressBar value={kcalRatio} label={t('nutrition.energy')} color="nutrition" />
                    </View>

                    <View style={styles.weekMetric}>
                      <View style={styles.weekMetricTop}>
                        <Text variant="captionStrong" color="textSecondary">
                          {t('nutrition.protein')}
                        </Text>
                        <Text variant="caption" color="textMuted">
                          {Math.round(daily.proteinG)} / {Math.round(targets.proteinG)} g
                        </Text>
                      </View>
                      <ProgressBar value={proteinRatio} label={t('nutrition.protein')} color="primary" />
                    </View>
                  </Card>
                );
              })}
            </View>
          ) : (
            <EmptyState icon="meal" message={t('common.loading')} />
          )}
        </Section>
      ) : null}

      {view === 'recipes' ? (
        <Section title={labels.plannedRecipes}>
          {recipes.length > 0 ? (
            <View style={styles.recipeGrid}>
              {recipes.map((recipe) => (
                <Card key={recipe.id} dense style={styles.recipeCard}>
                  <MealMedia uri={recipe.mediaUri} label={recipe.name[lang]} compact />
                  <View style={styles.recipeMeta}>
                    <View style={[styles.recipeIcon, { backgroundColor: colors.successSubtle }]}>
                      <Text variant="title3" color="nutrition">
                        {recipe.minutes}
                      </Text>
                      <Text variant="micro" color="textMuted">
                        min
                      </Text>
                    </View>
                    <View style={styles.flex}>
                    <Text variant="headline">{recipe.name[lang]}</Text>
                      <Text variant="caption" color="textMuted">
                        {recipe.slots.map((slot) => t(`enums.slot.${slot}`)).join(' · ')}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <EmptyState icon="meal" message={t('common.loading')} />
          )}

          <Text variant="caption" color="textMuted">
            {t('nutrition.source')}
          </Text>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    minWidth: 220,
  },
  mealStack: {
    gap: spacing.md,
  },
  weekStack: {
    gap: spacing.md,
  },
  weekCard: {
    gap: spacing.md,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  weekMetric: { gap: spacing.xs },
  weekMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recipeGrid: {
    gap: spacing.md,
  },
  recipeCard: { gap: spacing.md },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recipeIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
