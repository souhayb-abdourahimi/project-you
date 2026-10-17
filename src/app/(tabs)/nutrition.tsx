import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  ListGroup,
  ListRow,
  LoadingScreen,
  Screen,
  ScreenHeader,
  Section,
  Tabs,
  Text,
} from '@/components/ui';
import { getRecipe } from '@/domain/meals/recipes';
import { BudgetCard } from '@/features/nutrition/BudgetCard';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { DayNavigator } from '@/features/nutrition/DayNavigator';
import { DayTargets } from '@/features/nutrition/DayTargets';
import { ExclusionSummary } from '@/features/nutrition/ExclusionSummary';
import { MealCard } from '@/features/nutrition/MealCard';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { RecipeLibrary } from '@/features/nutrition/RecipeLibrary';
import { WeekIntake } from '@/features/nutrition/WeekIntake';
import { dayIntake } from '@/features/nutrition/view';
import { usePlan } from '@/hooks/usePlan';
import { spacing } from '@/theme';

type NutritionView = 'day' | 'week' | 'recipes';

/**
 * Nutrition (W-10 reference): Jour / Semaine / Recettes. The day view moves through the days of the
 * current plan; every number comes from meals explicitly marked eaten (dayIntake) and the planner.
 */
export default function NutritionScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  const [view, setView] = useState<NutritionView>('day');
  const [picked, setPicked] = useState<string | null>(null);

  if (!plan) return <LoadingScreen />;

  const { targets } = plan;
  const days = plan.mealPlan?.days ?? [];
  const dates = days.map((day) => day.date);
  const date = picked && dates.includes(picked) ? picked : plan.today;
  const day = days.find((d) => d.date === date);
  const intake = dayIntake(day?.meals);
  const recipes = [...new Set(days.flatMap((d) => d.meals.map((meal) => meal.recipeId)))].flatMap((id) => {
    const recipe = getRecipe(id);
    return recipe ? [recipe] : [];
  });
  const excluded = plan.snapshot.nutrition.excludedFoods.length + plan.snapshot.nutrition.intolerances.length > 0;

  return (
    <Screen airy>
      <View style={styles.top}>
        <ScreenHeader title={t('nutrition.title')} />
        <Tabs
          label={t('nutrition.title')}
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: t('nutrition.tabs.day') },
            { value: 'week', label: t('nutrition.tabs.week') },
            { value: 'recipes', label: t('nutrition.tabs.recipes') },
          ]}
        />
      </View>

      {view === 'day' ? (
        <>
          <View style={styles.stack}>
            {dates.length > 0 ? <DayNavigator dates={dates} value={date} onChange={setPicked} /> : null}
            <DayTargets targets={targets} intake={intake} />
          </View>

          <View style={styles.stack}>
            <View style={styles.sectionHeader}>
              <Text variant="title3" style={styles.flex}>
                {t('today.meals')}
              </Text>
              <Text variant="captionStrong" color="textMuted">
                {t('nutrition.mealsEaten', { eaten: intake.eaten, meals: intake.meals })}
              </Text>
            </View>
            <DayEnergyWarning day={day} />
            {day?.protein ? (
              <Text variant="caption" color="textMuted">
                {t('nutrition.proteinPlanned', { planned: day.protein.plannedG, target: day.protein.targetG })}
              </Text>
            ) : null}
            {plan.mealPlan?.diagnosis ? (
              <PlanDiagnosisCard diagnosis={plan.mealPlan.diagnosis} />
            ) : day?.protein && !day.protein.met ? (
              <Banner message={t('nutrition.proteinShort')} />
            ) : null}
            {day ? (
              day.meals.map((meal) => <MealCard key={meal.id} meal={meal} />)
            ) : (
              <Text color="textMuted">{t('common.loading')}</Text>
            )}
            <Button
              block
              icon="camera"
              label={t('nutrition.addMeal')}
              accessibilityHint={t('nutrition.addMealHint')}
              onPress={() => router.push('/meal-analysis')}
            />
            <Text variant="caption" color="textMuted">
              {t('nutrition.source')}
            </Text>
          </View>

          <ListGroup>
            <ListRow icon="meal" iconColor="nutrition" title={t('nutrition.inventory')} onPress={() => router.push('/inventory')} />
            <ListRow icon="shopping" iconColor="nutrition" title={t('nutrition.shopping')} onPress={() => router.push('/shopping')} />
          </ListGroup>

          {excluded ? (
            <Card muted>
              <ExclusionSummary
                excluded={plan.snapshot.nutrition.excludedFoods}
                intolerances={plan.snapshot.nutrition.intolerances}
              />
            </Card>
          ) : null}

          <BudgetCard />
        </>
      ) : null}

      {view === 'week' ? (
        <Section title={t('nutrition.tabs.week')}>
          <WeekIntake days={days} targets={targets} />
        </Section>
      ) : null}

      {view === 'recipes' ? (
        <Section title={t('nutrition.plannedRecipes')}>
          <RecipeLibrary recipes={recipes} />
          <Text variant="caption" color="textMuted">
            {t('nutrition.source')}
          </Text>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm },
  stack: { gap: spacing.sm + spacing.xxs },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
