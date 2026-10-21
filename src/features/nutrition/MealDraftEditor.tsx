import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChoiceGroup, IconButton, Icon, Notice, NumberStepper, Text } from '@/components/ui';
import { getFood } from '@/domain/meals/catalog';
import type { DraftItem } from '@/domain/meals/photo-analysis';
import type { MealSlot } from '@/domain/meals/recipes';
import { formatNumber } from '@/lib/format';
import { radius, spacing, useColors } from '@/theme';

import { FoodPicker } from './FoodPicker';
import type { MealAnalysis } from './useMealAnalysis';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The draft to check (W-10 reference "Notre IA estime"): each food with its portion and its Ciqual
 * estimate, editable; the total only when every item is known; "Confirmer et ajouter" only then.
 */
export function MealDraftEditor({ analysis, onSaved }: { analysis: MealAnalysis; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const { draft, edit } = analysis;
  const [picking, setPicking] = useState<string | 'new' | null>(null);
  const num = (v: number) => formatNumber(Math.round(v), i18n.language);
  const photo = draft.origin === 'photo';

  return (
    <Card raised style={styles.card}>
      <View style={styles.heading}>
        <Text variant="title3">{t(photo ? 'nutrition.analysis.estimateTitle' : 'nutrition.analysis.manualTitle')}</Text>
        <Text variant="caption" color="textMuted">
          {t('nutrition.analysis.checkHint')}
        </Text>
      </View>

      {draft.status === 'empty' ? (
        <Text color="textSecondary">
          {t(photo ? 'nutrition.analysis.nothingFound' : 'nutrition.analysis.emptyManual')}
        </Text>
      ) : null}

      {draft.items.map((item, i) => (
        <View
          key={item.key}
          style={[styles.item, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <ItemRow item={item} onRemove={() => edit.remove(item.key)} onMatch={() => setPicking(item.key)} />
          {item.foodId ? (
            // A row: the stepper grows sideways (its flex basis is a width).
            <View style={styles.stepper}>
              <NumberStepper
                compact
                unit="g"
                label={t('nutrition.analysis.portion')}
                value={item.grams}
                onChange={(grams) => edit.portion(item.key, grams)}
                step={10}
                min={0}
                decrease={t('nutrition.analysis.less')}
                increase={t('nutrition.analysis.more')}
              />
            </View>
          ) : null}
          {picking === item.key ? (
            <FoodPicker
              onPick={(id) => {
                edit.food(item.key, id);
                setPicking(null);
              }}
              onClose={() => setPicking(null)}
            />
          ) : null}
        </View>
      ))}

      {picking === 'new' ? (
        <FoodPicker
          onPick={(id) => {
            edit.add(id);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : (
        <Button
          compact
          variant="tertiary"
          icon="plus"
          label={t('nutrition.analysis.addFood')}
          onPress={() => setPicking('new')}
        />
      )}

      {draft.totals ? (
        <View
          style={[styles.total, { borderTopColor: colors.border }]}
          accessible
          accessibilityLabel={t('nutrition.analysis.totalA11y', {
            kcal: num(draft.totals.kcal),
            protein: num(draft.totals.proteinG),
            carbs: num(draft.totals.carbsG),
            fat: num(draft.totals.fatG),
          })}>
          <View style={styles.flex}>
            <Text variant="caption" color="textMuted">
              {t('nutrition.analysis.total')}
            </Text>
            <Text variant="metric">{num(draft.totals.kcal)} kcal</Text>
          </View>
          <Macro letter="P" value={num(draft.totals.proteinG)} color="nutrition" />
          <Macro letter="G" value={num(draft.totals.carbsG)} color="primary" />
          <Macro letter="L" value={num(draft.totals.fatG)} color="warning" />
        </View>
      ) : draft.status === 'incomplete' ? (
        <Notice
          tone="info"
          role="summary"
          message={[
            draft.missing.food > 0 ? t('nutrition.analysis.missingFoods', { count: draft.missing.food }) : null,
            draft.missing.portion > 0
              ? t('nutrition.analysis.missingPortions', { count: draft.missing.portion })
              : null,
            t('nutrition.analysis.incomplete'),
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}

      {draft.status === 'complete' ? (
        <View style={styles.slot}>
          <Text variant="caption" color="textMuted">
            {t('nutrition.analysis.slot')}
          </Text>
          <ChoiceGroup
            single
            label={t('nutrition.analysis.slot')}
            options={SLOTS.map((s) => ({ value: s, label: t(`enums.slot.${s}`) }))}
            selected={analysis.slot ? [analysis.slot] : []}
            onToggle={(s) => analysis.setSlot(analysis.slot === s ? null : s)}
          />
        </View>
      ) : null}

      <Text variant="caption" color="textMuted">
        {t('nutrition.source')}
      </Text>
      <Button
        block
        label={t('nutrition.analysis.confirm')}
        disabled={draft.status !== 'complete'}
        accessibilityHint={t('nutrition.analysis.confirmHint')}
        onPress={() => {
          if (analysis.confirm()) onSaved();
        }}
      />
    </Card>
  );
}

function ItemRow({ item, onRemove, onMatch }: { item: DraftItem; onRemove: () => void; onMatch: () => void }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const food = item.foodId ? getFood(item.foodId) : undefined;
  const num = (v: number) => formatNumber(Math.round(v), i18n.language);
  return (
    <View style={styles.row}>
      <View style={[styles.thumb, { backgroundColor: food ? colors.successSubtle : colors.surfaceSubtle }]}>
        <Icon name={food ? 'meal' : 'info'} size="md" color={food ? 'nutrition' : 'textMuted'} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">
          {food ? food.name[lang] : item.label}
          {item.grams !== null ? ` · ${t('common.grams', { value: item.grams })}` : ''}
        </Text>
        {item.nutrition ? (
          <Text variant="caption" color="textMuted">
            ≈ {num(item.nutrition.proteinG)} g {t('nutrition.protein').toLowerCase()} · {num(item.nutrition.kcal)} kcal
          </Text>
        ) : (
          <Text variant="caption" color="warning">
            {food ? t('nutrition.analysis.portionMissing') : t('nutrition.analysis.unmatched', { label: item.label })}
          </Text>
        )}
        {!food ? <Button compact variant="ghost" label={t('nutrition.analysis.chooseFood')} onPress={onMatch} /> : null}
      </View>
      <IconButton
        icon="close"
        tone="plain"
        label={t('nutrition.analysis.remove', { name: food ? food.name[lang] : item.label })}
        onPress={onRemove}
      />
    </View>
  );
}

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
    <View style={styles.macro} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text variant="captionStrong" color={color}>
        {letter}
      </Text>
      <Text variant="headline">{value} g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  heading: { gap: 2 },
  item: { gap: spacing.sm, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  total: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  macro: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs },
  slot: { gap: spacing.xs },
  stepper: { flexDirection: 'row', paddingLeft: 48 + spacing.md, maxWidth: 360 },
  flex: { flex: 1, gap: 2 },
});
