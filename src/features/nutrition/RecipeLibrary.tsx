import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, Text } from '@/components/ui';
import type { Recipe } from '@/domain/meals/recipes';
import { spacing } from '@/theme';

import { MealMedia } from './MealMedia';

/** The recipes actually used by this week's plan, as compact rows (thumbnail, name, slots, time). */
export function RecipeLibrary({ recipes }: { recipes: readonly Recipe[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  if (recipes.length === 0) return <EmptyState icon="meal" message={t('common.loading')} />;
  return (
    <View style={styles.stack}>
      {recipes.map((recipe) => (
        <Card
          key={recipe.id}
          dense
          style={styles.row}
          accessibilityLabel={`${recipe.name[lang]}, ${t('common.minutes', { count: recipe.minutes })}`}>
          <MealMedia recipeId={recipe.id} slot={recipe.slots[0]} label={recipe.name[lang]} size={56} />
          <View style={styles.text}>
            <Text variant="headline" numberOfLines={2}>
              {recipe.name[lang]}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {recipe.slots.map((slot) => t(`enums.slot.${slot}`)).join(' · ')}
            </Text>
          </View>
          <Text variant="captionStrong" color="nutrition">
            {recipe.minutes} {t('nutrition.minutesShort')}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
