import { useTranslation } from 'react-i18next';

import { Card, Text } from '@/components/ui';
import type { NutritionProfile } from '@/domain/profile/schemas';

/** Health-critical answers, always shown before the profile is saved (review B2, D-023). */
export function DietRecap({ nutrition }: { nutrition: NutritionProfile }) {
  const { t } = useTranslation();
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : t('onboarding.review.none'));
  const rows: [string, string][] = [
    [t('onboarding.review.diet'), t(`enums.diet.${nutrition.diet}`)],
    [t('onboarding.review.allergies'), list(nutrition.allergies.map((a) => t(`enums.allergen.${a}`)))],
    [t('onboarding.review.intolerances'), list(nutrition.intolerances)],
    [t('onboarding.review.excluded'), list(nutrition.excludedFoods)],
  ];
  return (
    <Card>
      <Text variant="heading" accessibilityRole="header">
        {t('onboarding.review.dietTitle')}
      </Text>
      {rows.map(([label, value]) => (
        <Text key={label}>
          <Text variant="label">{label} : </Text>
          {value}
        </Text>
      ))}
    </Card>
  );
}
