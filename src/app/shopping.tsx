import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, Row, Screen, Text } from '@/components/ui';
import { getFood } from '@/domain/meals/catalog';
import { getRecipe } from '@/domain/meals/recipes';
import { buildShoppingList } from '@/domain/meals/shopping';
import { usePlan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

export default function ShoppingScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const plan = usePlan();
  const inventory = useDataStore((s) => s.inventory);
  if (!plan?.mealPlan) return null;
  // No PriceProvider is configured: costs stay "Donnée indisponible" rather than guessed.
  const list = buildShoppingList(
    plan.mealPlan.days.flatMap((d) => d.meals),
    inventory,
    plan.today,
  );

  return (
    <Screen>
      <Button variant="secondary" label={t('shopping.nearbyStores')} onPress={() => router.push('/places')} />
      {list.items.length === 0 ? <EmptyState message={t('shopping.empty')} /> : null}
      {list.items.map((item) => (
        <Card key={item.foodId}>
          <Row>
            <Text variant="heading" style={{ flex: 1 }}>
              {getFood(item.foodId)?.name[lang]} · {t('common.grams', { value: item.grams })}
            </Text>
            <Text variant="label" color={item.priority === 'high' ? 'warning' : 'textMuted'}>
              {t(`shopping.priority.${item.priority}`)}
            </Text>
          </Row>
          <Text variant="caption" color="textMuted">
            {t('shopping.forRecipes', { recipes: item.recipeIds.map((id) => getRecipe(id)?.name[lang]).join(', ') })}
          </Text>
          <Text variant="caption" color="textMuted">
            {item.estimatedCostCents === null ? t('shopping.costUnknown') : t('shopping.cost')}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
