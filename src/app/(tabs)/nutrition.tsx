import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ProgressBar, Rationale, Row, Screen, Section, StatTile, Text } from '@/components/ui';
import { BudgetCard } from '@/features/nutrition/BudgetCard';
import { MealCard } from '@/features/nutrition/MealCard';
import { usePlan } from '@/hooks/usePlan';

export default function NutritionScreen() {
  const { t } = useTranslation();
  const plan = usePlan();
  if (!plan) return null;
  const { targets } = plan;
  const today = plan.mealPlan?.days.find((d) => d.date === plan.today);
  const eatenKcal = today?.meals.filter((m) => m.status === 'eaten').reduce((s, m) => s + m.nutrition.kcal, 0) ?? 0;

  return (
    <Screen>
      <Text variant="display">{t('nutrition.title')}</Text>
      <Card>
        <Text variant="heading">{t('nutrition.targets')}</Text>
        <Text variant="caption" color="textMuted">
          {t('nutrition.targetsHint')}
        </Text>
        <Text variant="title">
          {t('common.kcal', { value: Math.round(eatenKcal) })} / {t('common.kcal', { value: targets.calories })}
        </Text>
        <ProgressBar value={eatenKcal / targets.calories} label={t('nutrition.targets')} />
        <Row>
          <StatTile label={t('nutrition.protein')} value={t('common.grams', { value: targets.proteinG })} />
          <StatTile label={t('nutrition.carbs')} value={t('common.grams', { value: targets.carbsG })} />
          <StatTile label={t('nutrition.fat')} value={t('common.grams', { value: targets.fatG })} />
        </Row>
        {targets.warnings.map((w) => (
          <Banner key={w} message={t(`nutrition.warnings.${w}`)} />
        ))}
        <Rationale data={targets.rationale} />
      </Card>
      <Row>
        <Button variant="secondary" label={t('nutrition.inventory')} onPress={() => router.push('/inventory')} />
        <Button variant="secondary" label={t('nutrition.shopping')} onPress={() => router.push('/shopping')} />
      </Row>
      <BudgetCard />
      <Section title={t('today.meals')}>
        {today?.protein ? (
          <Text variant="caption" color="textMuted">
            {t('nutrition.proteinPlanned', { planned: today.protein.plannedG, target: today.protein.targetG })}
          </Text>
        ) : null}
        {today?.protein && !today.protein.met ? <Banner message={t('nutrition.proteinShort')} /> : null}
        {today ? (
          today.meals.map((m) => <MealCard key={m.id} meal={m} />)
        ) : (
          <Text color="textMuted">{t('common.loading')}</Text>
        )}
      </Section>
    </Screen>
  );
}
