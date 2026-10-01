import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, Text } from '@/components/ui';
import type { Adjustment, Blocker, PlanDiagnosis } from '@/domain/meals/diagnosis';

/** Explains why the meal plan is incomplete or short in protein, and what the user could change (C2, D-021). */
export function PlanDiagnosisCard({ diagnosis, compact }: { diagnosis: PlanDiagnosis; compact?: boolean }) {
  const { t } = useTranslation();
  const list = (items: string[]) => items.join(', ');

  const blocker = (b: Blocker) => {
    switch (b.kind) {
      case 'diet':
        return t('diagnosis.blocker.diet', { diet: t(`enums.diet.${b.diet}`) });
      case 'allergy':
        return t('diagnosis.blocker.allergy', { allergen: t(`enums.allergen.${b.allergen}`) });
      case 'exclusion':
        return t(`diagnosis.blocker.${b.source}`, { input: b.input });
      case 'cooking_time':
        return t('diagnosis.blocker.cooking_time', { minutes: b.minutes });
      case 'kitchen':
        return t('diagnosis.blocker.kitchen', { equipment: list(b.missing.map((e) => t(`enums.kitchen.${e}`))) });
    }
  };
  const adjustment = (a: Adjustment) => {
    switch (a.kind) {
      case 'allow_excluded_food':
        return t('diagnosis.adjustment.allow_excluded_food', { input: a.input });
      case 'more_cooking_time':
        return t('diagnosis.adjustment.more_cooking_time', { minutes: a.minutes });
      case 'kitchen_equipment':
        return t('diagnosis.adjustment.kitchen_equipment', {
          equipment: list(a.equipment.map((e) => t(`enums.kitchen.${e}`))),
        });
      case 'meals_per_day':
        return t('diagnosis.adjustment.meals_per_day', { count: a.mealsPerDay });
      case 'lower_protein_target':
        return t('diagnosis.adjustment.lower_protein_target', { value: a.reachableProteinG });
    }
  };

  const missing = diagnosis.missingSlots.length > 0;
  return (
    <Card>
      <Text variant="heading" accessibilityRole="header">
        {t(missing ? 'diagnosis.titleMissing' : 'diagnosis.titleProtein')}
      </Text>
      {missing ? (
        <Text>
          {t('diagnosis.missingSlots', { slots: list(diagnosis.missingSlots.map((s) => t(`enums.slot.${s}`))) })}
        </Text>
      ) : null}
      {diagnosis.proteinShortDays > 0 ? (
        <Text>
          {t('diagnosis.proteinShort', { reachable: diagnosis.reachableProteinG, target: diagnosis.targetProteinG })}
        </Text>
      ) : null}
      {compact ? null : (
        <>
          {diagnosis.blockers.length > 0 ? (
            <>
              <Text variant="label">{t('diagnosis.blockersTitle')}</Text>
              {diagnosis.blockers.map((b, i) => (
                <Text key={i}>• {blocker(b)}</Text>
              ))}
            </>
          ) : null}
          <Text variant="caption" color="textMuted">
            {t('diagnosis.respected')}
          </Text>
          <Text variant="label">
            {t(diagnosis.adjustments.length > 0 ? 'diagnosis.adjustmentsTitle' : 'diagnosis.noAdjustment')}
          </Text>
          {diagnosis.adjustments.map((a, i) => (
            <Text key={i}>• {adjustment(a)}</Text>
          ))}
        </>
      )}
      <Button
        variant="secondary"
        label={t(compact ? 'diagnosis.details' : 'diagnosis.editProfile')}
        onPress={() => router.push(compact ? '/nutrition' : '/settings')}
      />
    </Card>
  );
}
