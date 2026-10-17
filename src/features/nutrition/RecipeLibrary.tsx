import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, EmptyState, Text } from '@/components/ui';
import type { Recipe } from '@/domain/meals/recipes';
import { spacing } from '@/theme';

import { MealMedia } from './MealMedia';

/**
 * The recipes actually used by this week's plan, as rows of one shape whether a validated photo
 * exists or not (same 64 pt tile: the photo, else the meal's moment drawn on the nutrition tint),
 * so a recipe without a photo never looks unfinished. Name, moments, time.
 */
export function RecipeLibrary({ recipes }: { recipes: readonly Recipe[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  if (recipes.length === 0) return <EmptyState icon="meal" message={t('nutrition.recipesEmpty')} />;
  return (
    <View style={styles.stack}>
      {recipes.map((recipe) => (
        <Card
          key={recipe.id}
          dense
          style={styles.row}
          accessibilityLabel={t('nutrition.recipeA11y', {
            name: recipe.name[lang],
            slots: recipe.slots.map((slot) => t(`enums.slot.${slot}`)).join(', '),
            minutes: recipe.minutes,
          })}>
          <MealMedia recipeId={recipe.id} slot={recipe.slots[0]} label={recipe.name[lang]} size={64} />
          <View style={styles.text}>
            <Text variant="headline" numberOfLines={2}>
              {recipe.name[lang]}
            </Text>
            {/* Time and moments under the name: the name keeps the full width on an iPhone SE. */}
            <View style={styles.meta}>
              <Badge icon="time" label={`${recipe.minutes} ${t('nutrition.minutesShort')}`} />
              <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
                {recipe.slots.map((slot) => t(`enums.slot.${slot}`)).join(' · ')}
              </Text>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
