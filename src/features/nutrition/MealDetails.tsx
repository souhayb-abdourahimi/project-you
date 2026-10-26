import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Rationale, Text } from '@/components/ui';
import { getFood } from '@/domain/meals/catalog';
import { alternativesFor, type PlannedMeal, type ReplaceReason } from '@/domain/meals/planner';
import type { Recipe } from '@/domain/meals/recipes';
import type { Plan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';
import { radius, spacing, useColors } from '@/theme';

const REASONS: ReplaceReason[] = ['replace', 'faster', 'more_protein', 'cheaper'];

/** The recipe of a planned meal: ingredients, steps, alternatives and why it was chosen. */
export function MealDetails({ meal, recipe, plan }: { meal: PlannedMeal; recipe: Recipe; plan: Plan }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const replaceMeal = useDataStore((s) => s.replaceMeal);
  const [message, setMessage] = useState<string | null>(null);

  const replace = (reason: ReplaceReason, missingFoodId?: string) => {
    const result = alternativesFor(meal, reason, plan.plannerContext, { missingFoodId });
    if (result.status === 'unavailable') return setMessage(t('nutrition.noPrices'));
    if (result.meals.length === 0) return setMessage(t('nutrition.noAlternative'));
    replaceMeal(result.meals[0]);
    setMessage(null);
  };

  return (
    <View style={[styles.details, { borderTopColor: colors.border }]}>
      <Text variant="label">{t('nutrition.ingredients')}</Text>
      {meal.ingredients.map((ingredient) => (
        <View key={ingredient.foodId} style={styles.ingredient}>
          <Text style={styles.flex}>
            {getFood(ingredient.foodId)?.name[lang]} · {t('common.grams', { value: ingredient.grams })}
          </Text>
          <Button
            compact
            variant="ghost"
            label={t('nutrition.alternatives.missing_ingredient')}
            onPress={() => replace('missing_ingredient', ingredient.foodId)}
          />
        </View>
      ))}

      <Text variant="label">{t('nutrition.steps')}</Text>
      {recipe.steps[lang].map((step, index) => (
        <View key={index} style={styles.step}>
          <View style={[styles.stepNumber, { backgroundColor: colors.primarySubtle }]}>
            <Text variant="captionStrong" color="primary">
              {index + 1}
            </Text>
          </View>
          <Text style={styles.flex}>{step}</Text>
        </View>
      ))}

      <View style={styles.alternatives}>
        {REASONS.map((reason) => (
          <Button
            key={reason}
            compact
            variant="secondary"
            label={t(`nutrition.alternatives.${reason}`)}
            onPress={() => replace(reason)}
          />
        ))}
      </View>

      {message ? (
        <Text variant="caption" color="textMuted">
          {message}
        </Text>
      ) : null}

      <Rationale data={meal.rationale} />
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNumber: { width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  alternatives: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
