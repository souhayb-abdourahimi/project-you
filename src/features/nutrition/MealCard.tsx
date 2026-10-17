import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, Icon, MockBadge, Text } from '@/components/ui';
import { MEAL_REASONS, type MealReason } from '@/domain/journey/outcomes';
import { getFood, hasMockFood } from '@/domain/meals/catalog';
import type { PlannedMeal } from '@/domain/meals/planner';
import { getRecipe } from '@/domain/meals/recipes';
import { MealDetails } from '@/features/nutrition/MealDetails';
import { MealMedia } from '@/features/nutrition/MealMedia';
import { usePlan } from '@/hooks/usePlan';
import { formatNumber } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { MIN_TOUCH, PRESSED_SCALE, radius, spacing, useColors } from '@/theme';

/**
 * A planned meal as one row (W-10 reference): thumbnail, slot, dish, kcal and macros, and a round
 * "eaten" control on the right (one tap). Tapping the row opens the rest: not as planned (skipped /
 * something else, with an optional reason), undo, and the recipe. `compact` (Today) is the row
 * alone and opens Nutrition.
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

  const recipe = getRecipe(meal.recipeId);
  if (!recipe || !plan) return null;
  const num = (v: number) => formatNumber(Math.round(v), i18n.language);
  const slot = t(`enums.slot.${meal.slot}`);
  const status =
    meal.status === 'eaten'
      ? t('nutrition.eaten')
      : meal.status === 'skipped'
        ? t('nutrition.skipped')
        : meal.status === 'replaced'
          ? t('nutrition.replaced')
          : null;
  const macros = `P ${num(meal.nutrition.proteinG)} · G ${num(meal.nutrition.carbsG)} · L ${num(meal.nutrition.fatG)} g`;
  const label = [
    slot,
    recipe.name[lang],
    `${num(meal.nutrition.kcal)} kcal`,
    t('nutrition.macrosA11y', {
      protein: num(meal.nutrition.proteinG),
      carbs: num(meal.nutrition.carbsG),
      fat: num(meal.nutrition.fatG),
    }),
    status,
  ]
    .filter(Boolean)
    .join(', ');

  const row = (
    <View style={styles.row}>
      <MealMedia recipeId={recipe.id} slot={meal.slot} label={recipe.name[lang]} size={compact ? 52 : 60} />
      <View style={styles.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.slotLine}>
          <Text variant="headline">{slot}</Text>
          {hasMockFood(meal.ingredients.map((i) => i.foodId)) ? <MockBadge /> : null}
        </View>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {recipe.name[lang]}
        </Text>
        <View style={styles.kcalLine}>
          <Text variant="captionStrong">{num(meal.nutrition.kcal)} kcal</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.flexShrink}>
            {meal.status === 'skipped' || meal.status === 'replaced' ? status : macros}
          </Text>
        </View>
      </View>
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
        <Card dense style={styles.compactCard}>
          <View style={styles.flex}>{row}</View>
          {meal.status === 'eaten' ? (
            <View style={[styles.mark, styles.markSmall, { backgroundColor: colors.success }]}>
              <Icon name="check" size={14} color="surface" />
            </View>
          ) : (
            <Icon name="chevron" size="sm" color="textMuted" />
          )}
        </Card>
      </Pressable>
    );
  }

  return (
    <Card dense style={styles.card}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={t('nutrition.openMeal')}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={() => setOpen((v) => !v)}
          style={styles.flex}>
          {row}
        </Pressable>
        <MarkButton
          status={meal.status}
          slot={slot}
          onEat={() => markEaten(meal.id)}
          onUndo={() => unmark(meal.id)}
          onOpen={() => setOpen(true)}
        />
      </View>

      {open ? (
        <View style={[styles.more, { borderTopColor: colors.border }]}>
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

          {meal.status === 'planned' ? (
            <View style={styles.actions}>
              <Text variant="caption" color="textMuted" style={styles.full}>
                {t('nutrition.notAsPlanned')}
              </Text>
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
            </View>
          ) : meal.status === 'eaten' ? null : (
            <View style={[styles.panel, { backgroundColor: colors.surfaceSubtle }]}>
              <Text variant="captionStrong" color="textSecondary">
                {status}
                {meal.reason ? ` · ${t(`nutrition.reason.${meal.reason}`)}` : ''}
              </Text>
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
          )}

          <MealDetails meal={meal} recipe={recipe} plan={plan} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * The round control on the right of a meal: planned → "Je l'ai mangé" in one tap; eaten → a green
 * check that undoes it; skipped / something else → opens the meal to change it. ≥ 44 pt.
 */
function MarkButton({
  status,
  slot,
  onEat,
  onUndo,
  onOpen,
}: {
  status: PlannedMeal['status'];
  slot: string;
  onEat: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const look =
    status === 'eaten'
      ? { bg: colors.success, border: colors.success, icon: 'check' as const, color: 'surface' as const }
      : status === 'planned'
        ? { bg: colors.surface, border: colors.borderStrong, icon: 'check' as const, color: 'textMuted' as const }
        : {
            bg: colors.surfaceSubtle,
            border: colors.surfaceSubtle,
            icon: 'skipped' as const,
            color: 'textMuted' as const,
          };
  const a11y =
    status === 'eaten'
      ? t('nutrition.undoEaten', { slot })
      : status === 'planned'
        ? t('nutrition.markEaten')
        : t('nutrition.changeStatus', { slot });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: status === 'eaten' }}
      hitSlop={spacing.xs}
      onPress={status === 'eaten' ? onUndo : status === 'planned' ? onEat : onOpen}
      style={({ pressed }) => [
        styles.mark,
        { backgroundColor: look.bg, borderColor: look.border, transform: [{ scale: pressed ? PRESSED_SCALE : 1 }] },
      ]}>
      <Icon name={look.icon} size="md" color={look.color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  compactCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 1 },
  slotLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  kcalLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  mark: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSmall: { width: 26, height: 26, borderWidth: 0 },
  more: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  panel: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  full: { width: '100%' },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
});
