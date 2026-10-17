import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, ChoiceGroup, Icon, MockBadge, Text } from '@/components/ui';
import { MEAL_REASONS, type MealReason } from '@/domain/journey/outcomes';
import { getFood, hasMockFood } from '@/domain/meals/catalog';
import type { PlannedMeal } from '@/domain/meals/planner';
import { getRecipe } from '@/domain/meals/recipes';
import { MealDetails } from '@/features/nutrition/MealDetails';
import { MealMedia } from '@/features/nutrition/MealMedia';
import { usePlan } from '@/hooks/usePlan';
import { formatNumber } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { PRESSED_SCALE, radius, spacing, useColors } from '@/theme';

/**
 * A planned meal as a row (W-10 reference): thumbnail, slot, dish, kcal, then its status. The full
 * card adds the macros, the "eaten / not eaten / something else" actions and the recipe on demand;
 * `compact` (Today) is the row alone and opens Nutrition.
 */
export function MealCard({ meal, compact }: { meal: PlannedMeal; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const plan = usePlan();
  const markEaten = useDataStore((s) => s.markMealEaten);
  const markSkipped = useDataStore((s) => s.markMealSkipped);
  const markReplaced = useDataStore((s) => s.markMealReplaced);
  const unmark = useDataStore((s) => s.unmarkMeal);
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);

  const recipe = getRecipe(meal.recipeId);
  if (!recipe || !plan) return null;
  const num = (v: number) => formatNumber(Math.round(v), i18n.language);
  const kcal = `${num(meal.nutrition.kcal)} kcal`;
  const status =
    meal.status === 'eaten'
      ? t('nutrition.eaten')
      : meal.status === 'skipped'
        ? t('nutrition.skipped')
        : meal.status === 'replaced'
          ? t('nutrition.replaced')
          : null;
  const label = [t(`enums.slot.${meal.slot}`), recipe.name[lang], kcal, t('nutrition.estimate'), status]
    .filter(Boolean)
    .join(', ');

  const row = (
    <View style={styles.row}>
      <MealMedia uri={recipe.mediaUri} label={recipe.name[lang]} size={compact ? 56 : 64} />
      <View style={styles.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.slotLine}>
          <Text variant="headline">{t(`enums.slot.${meal.slot}`)}</Text>
          {hasMockFood(meal.ingredients.map((i) => i.foodId)) ? <MockBadge /> : null}
        </View>
        <Text variant="caption" color="textSecondary" numberOfLines={2}>
          {recipe.name[lang]}
        </Text>
        <Text variant="captionStrong">{kcal}</Text>
      </View>
      {meal.status === 'eaten' ? (
        <View style={[styles.done, { backgroundColor: colors.success }]}>
          <Icon name="check" size={14} color="surface" />
        </View>
      ) : (
        <Icon name="chevron" size="sm" color="textMuted" />
      )}
    </View>
  );

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('today.glance.openNutrition')}
        onPress={() => router.push('/nutrition')}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? PRESSED_SCALE : 1 }] })}>
        <Card dense>{row}</Card>
      </Pressable>
    );
  }

  return (
    <Card dense style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('nutrition.recipe')}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}>
        {row}
      </Pressable>

      <View style={styles.macros} accessibilityLabel={t('nutrition.macrosA11y', macros(meal))}>
        <Macro letter="P" value={`${num(meal.nutrition.proteinG)} g`} color="nutrition" />
        <Macro letter="G" value={`${num(meal.nutrition.carbsG)} g`} color="primary" />
        <Macro letter="L" value={`${num(meal.nutrition.fatG)} g`} color="warning" />
        <Text variant="caption" color="textMuted" style={styles.minutes}>
          {t('common.minutes', { count: recipe.minutes })}
        </Text>
      </View>

      {(meal.substitutions ?? []).map((sub) => (
        <Text key={sub.from} variant="caption" color="textMuted">
          {t('nutrition.adapted', { from: getFood(sub.from)?.name[lang], to: getFood(sub.to)?.name[lang] })}
        </Text>
      ))}
      {meal.usesInventory.length > 0 ? (
        <View style={styles.inline}>
          <Icon name="check" size="sm" color="success" />
          <Text variant="caption" color="success">
            {t('nutrition.usesInventory', { count: meal.usesInventory.length })}
          </Text>
        </View>
      ) : null}

      {meal.status === 'skipped' || meal.status === 'replaced' ? (
        <View style={[styles.panel, { backgroundColor: colors.surfaceSubtle }]}>
          <Badge tone="neutral" label={`${status}${meal.reason ? ` · ${t(`nutrition.reason.${meal.reason}`)}` : ''}`} />
          <Text variant="caption" color="textMuted">
            {t('nutrition.reasonQuestion')}
          </Text>
          <ChoiceGroup
            options={MEAL_REASONS.map((reason) => ({ value: reason, label: t(`nutrition.reason.${reason}`) }))}
            selected={meal.reason ? [meal.reason] : []}
            onToggle={(reason: MealReason) => {
              const mark = meal.status === 'skipped' ? markSkipped : markReplaced;
              mark(meal.id, meal.reason === reason ? undefined : reason);
            }}
          />
          <Button compact variant="ghost" label={t('nutrition.undo')} onPress={() => unmark(meal.id)} />
        </View>
      ) : meal.status === 'eaten' ? (
        <View style={styles.inline}>
          <Badge tone="positive" icon="check" label={t('nutrition.eaten')} />
          <Button compact variant="ghost" label={t('nutrition.undo')} onPress={() => unmark(meal.id)} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button compact icon="check" label={t('nutrition.markEaten')} onPress={() => markEaten(meal.id)} />
          {other ? (
            <>
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
            </>
          ) : (
            <Button
              compact
              variant="tertiary"
              label={t('nutrition.notAsPlanned')}
              expanded={false}
              onPress={() => setOther(true)}
            />
          )}
        </View>
      )}

      {open ? <MealDetails meal={meal} recipe={recipe} plan={plan} /> : null}
    </Card>
  );
}

const macros = (meal: PlannedMeal) => ({
  protein: Math.round(meal.nutrition.proteinG),
  carbs: Math.round(meal.nutrition.carbsG),
  fat: Math.round(meal.nutrition.fatG),
});

function Macro({
  letter,
  value,
  color,
}: {
  letter: string;
  value: string;
  color: 'nutrition' | 'primary' | 'warning';
}) {
  return (
    <View style={styles.inline} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text variant="captionStrong" color={color}>
        {letter}
      </Text>
      <Text variant="captionStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm + spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  slotLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  done: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  macros: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  minutes: { marginLeft: 'auto' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  panel: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
