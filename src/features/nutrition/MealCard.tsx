import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, ChoiceGroup, MockBadge, Rationale, Row, Text } from '@/components/ui';
import { MEAL_REASONS, type MealReason } from '@/domain/journey/outcomes';
import { getFood, hasMockFood } from '@/domain/meals/catalog';
import { alternativesFor, type PlannedMeal, type ReplaceReason } from '@/domain/meals/planner';
import { getRecipe } from '@/domain/meals/recipes';
import { usePlan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';
import { spacing } from '@/theme';

const REASONS: ReplaceReason[] = ['replace', 'faster', 'more_protein', 'cheaper'];

export function MealCard({ meal, compact }: { meal: PlannedMeal; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const plan = usePlan();
  const markEaten = useDataStore((s) => s.markMealEaten);
  const markSkipped = useDataStore((s) => s.markMealSkipped);
  const markReplaced = useDataStore((s) => s.markMealReplaced);
  const unmark = useDataStore((s) => s.unmarkMeal);
  const replaceMeal = useDataStore((s) => s.replaceMeal);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recipe = getRecipe(meal.recipeId);
  if (!recipe || !plan) return null;

  const replace = (reason: ReplaceReason, missingFoodId?: string) => {
    const result = alternativesFor(meal, reason, plan.plannerContext, { missingFoodId });
    if (result.status === 'unavailable') return setMessage(t('nutrition.noPrices'));
    if (result.meals.length === 0) return setMessage(t('nutrition.noAlternative'));
    replaceMeal(result.meals[0]);
    setMessage(null);
  };

  return (
    <Card>
      <Row>
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {t(`enums.slot.${meal.slot}`)} · {t('common.kcal', { value: Math.round(meal.nutrition.kcal) })} ·{' '}
          {t('common.minutes', { count: recipe.minutes })}
        </Text>
        {hasMockFood(meal.ingredients.map((i) => i.foodId)) ? <MockBadge /> : null}
      </Row>
      <Text variant="heading">{recipe.name[lang]}</Text>
      <Text variant="caption" color="textMuted">
        {t('nutrition.protein')} {Math.round(meal.nutrition.proteinG)} g · {t('nutrition.carbs')}{' '}
        {Math.round(meal.nutrition.carbsG)} g · {t('nutrition.fat')} {Math.round(meal.nutrition.fatG)} g
      </Text>
      {(meal.substitutions ?? []).map((sub) => (
        <Text key={sub.from} variant="caption" color="textMuted">
          {t('nutrition.adapted', { from: getFood(sub.from)?.name[lang], to: getFood(sub.to)?.name[lang] })}
        </Text>
      ))}
      {meal.usesInventory.length > 0 ? (
        <Text variant="caption" color="success">
          {t('nutrition.usesInventory', { count: meal.usesInventory.length })}
        </Text>
      ) : null}
      {meal.status === 'eaten' ? (
        <Text color="success">{t('nutrition.eaten')}</Text>
      ) : meal.status === 'skipped' || meal.status === 'replaced' ? (
        <View style={{ gap: spacing.xs }}>
          <Text color="textMuted">
            {t(meal.status === 'skipped' ? 'nutrition.skipped' : 'nutrition.replaced')}
            {meal.reason ? ` · ${t(`nutrition.reason.${meal.reason}`)}` : ''}
          </Text>
          {compact ? null : (
            <>
              {/* The reason is optional and never guessed: without an answer it stays empty. */}
              <Text variant="caption" color="textMuted">
                {t('nutrition.reasonQuestion')}
              </Text>
              <ChoiceGroup
                options={MEAL_REASONS.map((r) => ({ value: r, label: t(`nutrition.reason.${r}`) }))}
                selected={meal.reason ? [meal.reason] : []}
                onToggle={(r: MealReason) => {
                  const mark = meal.status === 'skipped' ? markSkipped : markReplaced;
                  mark(meal.id, meal.reason === r ? undefined : r);
                }}
              />
              <Button compact variant="ghost" label={t('nutrition.undo')} onPress={() => unmark(meal.id)} />
            </>
          )}
        </View>
      ) : compact ? null : (
        <Row>
          <Button compact label={t('nutrition.markEaten')} onPress={() => markEaten(meal.id)} />
          {/* A day counts as logged once each meal is marked; the safety rule reads only marked days. */}
          <Button compact variant="secondary" label={t('nutrition.markSkipped')} onPress={() => markSkipped(meal.id)} />
          {/* Eaten something else: logged, but its calories are unknown (never counted as complete). */}
          <Button
            compact
            variant="secondary"
            label={t('nutrition.markReplaced')}
            onPress={() => markReplaced(meal.id)}
          />
          <Button compact variant="secondary" label={t('nutrition.recipe')} onPress={() => setOpen(!open)} />
        </Row>
      )}
      {open ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label">{t('nutrition.ingredients')}</Text>
          {meal.ingredients.map((i) => (
            <Row key={i.foodId}>
              <Text style={{ flex: 1 }}>
                {getFood(i.foodId)?.name[lang]} · {t('common.grams', { value: i.grams })}
              </Text>
              <Button
                compact
                variant="ghost"
                label={t('nutrition.alternatives.missing_ingredient')}
                onPress={() => replace('missing_ingredient', i.foodId)}
              />
            </Row>
          ))}
          <Text variant="label">{t('nutrition.steps')}</Text>
          {recipe.steps[lang].map((s, i) => (
            <Text key={i}>
              {i + 1}. {s}
            </Text>
          ))}
          <Row>
            {REASONS.map((r) => (
              <Button
                key={r}
                compact
                variant="secondary"
                label={t(`nutrition.alternatives.${r}`)}
                onPress={() => replace(r)}
              />
            ))}
          </Row>
          {message ? <Text color="textMuted">{message}</Text> : null}
          <Text variant="caption" color="textMuted">
            {t('nutrition.source')}
          </Text>
          <Rationale data={meal.rationale} />
        </View>
      ) : null}
    </Card>
  );
}
