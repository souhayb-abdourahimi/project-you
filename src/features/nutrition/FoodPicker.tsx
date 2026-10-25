import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { FOOD_CATALOG } from '@/domain/meals/catalog';
import { MIN_TOUCH, radius, spacing, useColors } from '@/theme';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Picks a food of the Ciqual catalogue (to match an unrecognised item or to add one by hand). Only
 * catalogue foods can be chosen: their values are known, so the meal stays computable.
 */
export function FoodPicker({ onPick, onClose }: { onPick: (foodId: string) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  const matches = FOOD_CATALOG.filter((f) => !q || fold(f.name.fr).includes(q) || fold(f.name.en).includes(q)).slice(
    0,
    8,
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      <TextField
        label={t('nutrition.analysis.searchFood')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      {matches.length === 0 ? (
        <Text variant="caption" color="textMuted">
          {t('nutrition.analysis.noFood')}
        </Text>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {matches.map((food, i) => (
            <Pressable
              key={food.id}
              accessibilityRole="button"
              accessibilityLabel={`${food.name[lang]}, ${t('nutrition.analysis.per100g', { kcal: Math.round(food.per100g.kcal) })}`}
              onPress={() => onPick(food.id)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: colors.surfaceSubtle },
              ]}>
              <Icon name="plus" size="sm" color="primary" />
              <Text style={styles.flex}>{food.name[lang]}</Text>
              <Text variant="caption" color="textMuted">
                {t('nutrition.analysis.per100g', { kcal: Math.round(food.per100g.kcal) })}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Button compact variant="ghost" label={t('common.cancel')} onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  list: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  flex: { flex: 1 },
});
