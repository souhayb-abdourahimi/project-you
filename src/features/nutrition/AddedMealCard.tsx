import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, ConfirmButton, Icon, Text } from '@/components/ui';
import { getFood } from '@/domain/meals/catalog';
import type { LoggedMeal } from '@/domain/meals/photo-analysis';
import { formatNumber } from '@/lib/format';
import { useDataStore } from '@/state/data';
import { radius, spacing, useColors } from '@/theme';

/**
 * A meal the user added outside the plan (W-10): what it held (catalogue foods and grams), its
 * Ciqual estimate and where it came from. Removable, with a confirmation.
 */
export function AddedMealCard({ meal }: { meal: LoggedMeal }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const remove = useDataStore((s) => s.removeLoggedMeal);
  const num = (v: number) => formatNumber(Math.round(v), i18n.language);
  const foods = meal.items
    .map((i) => `${getFood(i.foodId)?.name[lang] ?? i.foodId} · ${t('common.grams', { value: i.grams })}`)
    .join(', ');
  const title = meal.slot ? t(`enums.slot.${meal.slot}`) : t('nutrition.added.title');
  const origin = t(meal.source === 'photo_estimate' ? 'nutrition.added.fromPhoto' : 'nutrition.added.manual');
  return (
    <Card dense style={styles.card}>
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${title}, ${foods}, ${num(meal.nutrition.kcal)} kcal, ${origin}`}>
        <View style={[styles.thumb, { backgroundColor: colors.surfaceSubtle }]}>
          <Icon name={meal.source === 'photo_estimate' ? 'camera' : 'meal'} size="md" color="nutrition" />
        </View>
        <View style={styles.text}>
          <Text variant="headline">{title}</Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {foods}
          </Text>
          <Text variant="captionStrong">
            {num(meal.nutrition.kcal)} kcal ·{' '}
            <Text variant="caption" color="textMuted">
              {origin}
            </Text>
          </Text>
        </View>
        <View style={[styles.done, { backgroundColor: colors.success }]}>
          <Icon name="check" size={14} color="surface" />
        </View>
      </View>
      <ConfirmButton
        variant="ghost"
        label={t('nutrition.added.remove')}
        message={t('nutrition.added.removeMessage')}
        confirmLabel={t('nutrition.added.removeConfirm')}
        onConfirm={() => remove(meal.id)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 64, height: 64, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  done: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
