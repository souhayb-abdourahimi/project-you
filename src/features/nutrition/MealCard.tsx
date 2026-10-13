import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  ChoiceGroup,
  Icon,
  MockBadge,
  Rationale,
  Row,
  Text,
} from '@/components/ui';
import { MEAL_REASONS, type MealReason } from '@/domain/journey/outcomes';
import { getFood, hasMockFood } from '@/domain/meals/catalog';
import { alternativesFor, type PlannedMeal, type ReplaceReason } from '@/domain/meals/planner';
import { getRecipe } from '@/domain/meals/recipes';
import { usePlan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';
import { radius, spacing, useColors } from '@/theme';

const REASONS: ReplaceReason[] = ['replace', 'faster', 'more_protein', 'cheaper'];

export function MealCard({ meal, compact }: { meal: PlannedMeal; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
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

  const statusTone =
    meal.status === 'eaten'
      ? { background: colors.successSubtle, accent: colors.success }
      : meal.status === 'planned'
        ? { background: colors.surfaceSubtle, accent: colors.textMuted }
        : { background: colors.warningSubtle, accent: colors.warning };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.slotIcon, { backgroundColor: statusTone.background }]}>
          <Icon name="meal" size="md" color={meal.status === 'eaten' ? 'success' : 'nutrition'} />
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.slotLine}>
            <Text variant="overline" color="nutrition">
              {t(`enums.slot.${meal.slot}`)}
            </Text>
            {hasMockFood(meal.ingredients.map((i) => i.foodId)) ? <MockBadge /> : null}
          </View>
          <Text variant={compact ? 'headline' : 'title3'}>{recipe.name[lang]}</Text>
          <Text variant="caption" color="textMuted">
            {t('common.minutes', { count: recipe.minutes })}
          </Text>
        </View>

        {meal.status === 'eaten' ? (
          <Badge tone="positive" icon="check" label={t('nutrition.eaten')} />
        ) : null}
      </View>

      <View style={styles.nutritionRow}>
        <NutritionValue
          label="kcal"
          value={String(Math.round(meal.nutrition.kcal))}
          background={colors.primarySubtle}
        />
        <NutritionValue
          label={t('nutrition.protein')}
          value={`${Math.round(meal.nutrition.proteinG)} g`}
          background={colors.successSubtle}
        />
        <NutritionValue
          label={t('nutrition.carbs')}
          value={`${Math.round(meal.nutrition.carbsG)} g`}
          background={colors.surfaceSubtle}
        />
        <NutritionValue
          label={t('nutrition.fat')}
          value={`${Math.round(meal.nutrition.fatG)} g`}
          background={colors.surfaceSubtle}
        />
      </View>

      {(meal.substitutions ?? []).map((sub) => (
        <Text key={sub.from} variant="caption" color="textMuted">
          {t('nutrition.adapted', { from: getFood(sub.from)?.name[lang], to: getFood(sub.to)?.name[lang] })}
        </Text>
      ))}

      {meal.usesInventory.length > 0 ? (
        <View style={styles.inventoryLine}>
          <Icon name="check" size="sm" color="success" />
          <Text variant="caption" color="success">
            {t('nutrition.usesInventory', { count: meal.usesInventory.length })}
          </Text>
        </View>
      ) : null}

      {meal.status === 'skipped' || meal.status === 'replaced' ? (
        <View style={[styles.statusPanel, { backgroundColor: statusTone.background }]}>
          <Text variant="captionStrong" style={{ color: statusTone.accent }}>
            {t(meal.status === 'skipped' ? 'nutrition.skipped' : 'nutrition.replaced')}
            {meal.reason ? ` · ${t(`nutrition.reason.${meal.reason}`)}` : ''}
          </Text>

          {compact ? null : (
            <>
              <Text variant="caption" color="textMuted">
                {t('nutrition.reasonQuestion')}
              </Text>
              <ChoiceGroup
                options={MEAL_REASONS.map((reason) => ({
                  value: reason,
                  label: t(`nutrition.reason.${reason}`),
                }))}
                selected={meal.reason ? [meal.reason] : []}
                onToggle={(reason: MealReason) => {
                  const mark = meal.status === 'skipped' ? markSkipped : markReplaced;
                  mark(meal.id, meal.reason === reason ? undefined : reason);
                }}
              />
              <Button compact variant="ghost" label={t('nutrition.undo')} onPress={() => unmark(meal.id)} />
            </>
          )}
        </View>
      ) : meal.status === 'eaten' ? (
        compact ? null : (
          <Button compact variant="ghost" label={t('nutrition.undo')} onPress={() => unmark(meal.id)} />
        )
      ) : compact ? null : (
        <View style={styles.actions}>
          <Button label={t('nutrition.markEaten')} onPress={() => markEaten(meal.id)} />
          <Row>
            <Button
              compact
              variant="secondary"
              label={t('nutrition.markSkipped')}
              onPress={() => markSkipped(meal.id)}
            />
            <Button
              compact
              variant="secondary"
              label={t('nutrition.markReplaced')}
              onPress={() => markReplaced(meal.id)}
            />
          </Row>
        </View>
      )}

      {compact ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={({ pressed }) => [
            styles.detailsToggle,
            { backgroundColor: pressed ? colors.surfaceSubtle : 'transparent' },
          ]}>
          <Text variant="captionStrong" color="textSecondary">
            {t('nutrition.recipe')}
          </Text>
          <Icon name="chevron" size="sm" color="textMuted" />
        </Pressable>
      )}

      {open ? (
        <View style={styles.details}>
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
      ) : null}
    </Card>
  );
}

function NutritionValue({
  label,
  value,
  background,
}: {
  label: string;
  value: string;
  background: string;
}) {
  return (
    <View style={[styles.nutritionValue, { backgroundColor: background }]}>
      <Text variant="captionStrong">{value}</Text>
      <Text variant="micro" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  slotIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { flex: 1, gap: spacing.xs },
  slotLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  nutritionRow: { flexDirection: 'row', gap: spacing.sm },
  nutritionValue: {
    flex: 1,
    minWidth: 64,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  inventoryLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusPanel: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  actions: { gap: spacing.sm },
  detailsToggle: {
    minHeight: 44,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  details: { gap: spacing.md },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alternatives: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
