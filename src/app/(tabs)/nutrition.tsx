import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ActionCard, Banner, Card, LoadingScreen, Screen, ScreenHeader, Section, Text } from '@/components/ui';
import { BudgetCard } from '@/features/nutrition/BudgetCard';
import { DayEnergyWarning } from '@/features/nutrition/DayEnergyWarning';
import { DayTargets } from '@/features/nutrition/DayTargets';
import { ExclusionSummary } from '@/features/nutrition/ExclusionSummary';
import { MealCard } from '@/features/nutrition/MealCard';
import { PlanDiagnosisCard } from '@/features/nutrition/PlanDiagnosisCard';
import { dayIntake } from '@/features/nutrition/view';
import { usePlan } from '@/hooks/usePlan';
import { spacing } from '@/theme';
import { formatDate } from '@/lib/format';

export default function NutritionScreen() {
  const { t, i18n } = useTranslation();
  const plan = usePlan();
  if (!plan) return <LoadingScreen />;
  const { targets } = plan;
  const today = plan.mealPlan?.days.find((d) => d.date === plan.today);

  return (
    <Screen airy>
      <ScreenHeader subtitle={formatDate(plan.today, i18n.language)} title={t('nutrition.title')} />
      <DayTargets targets={targets} intake={dayIntake(today?.meals)} />
      <View style={styles.links}>
        <ActionCard
          icon="meal"
          iconColor="nutrition"
          title={t('nutrition.inventory')}
          onPress={() => router.push('/inventory')}
        />
        <ActionCard
          icon="shopping"
          iconColor="nutrition"
          title={t('nutrition.shopping')}
          onPress={() => router.push('/shopping')}
        />
      </View>
      {plan.snapshot.nutrition.excludedFoods.length + plan.snapshot.nutrition.intolerances.length > 0 ? (
        <Card muted>
          <ExclusionSummary
            excluded={plan.snapshot.nutrition.excludedFoods}
            intolerances={plan.snapshot.nutrition.intolerances}
          />
        </Card>
      ) : null}
      <Section title={t('today.meals')}>
        <DayEnergyWarning day={today} />
        {today?.protein ? (
          <Text variant="caption" color="textMuted">
            {t('nutrition.proteinPlanned', { planned: today.protein.plannedG, target: today.protein.targetG })}
          </Text>
        ) : null}
        {plan.mealPlan?.diagnosis ? (
          <PlanDiagnosisCard diagnosis={plan.mealPlan.diagnosis} />
        ) : today?.protein && !today.protein.met ? (
          <Banner message={t('nutrition.proteinShort')} />
        ) : null}
        {today ? (
          today.meals.map((m) => <MealCard key={m.id} meal={m} />)
        ) : (
          <Text color="textMuted">{t('common.loading')}</Text>
        )}
        <Text variant="caption" color="textMuted">
          {t('nutrition.source')}
        </Text>
      </Section>
      <BudgetCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { gap: spacing.sm },
});
