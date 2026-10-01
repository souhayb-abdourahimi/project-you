import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui';
import type { DailyMealPlan } from '@/domain/meals/planner';

/** "Cette journée est incomplète" with the missing energy; never a too-low day without it (B1, D-022). */
export function DayEnergyWarning({ day }: { day: DailyMealPlan | null | undefined }) {
  const { t } = useTranslation();
  const energy = day?.energy;
  if (!energy?.incomplete) return null;
  const message = [
    t('nutrition.dayIncomplete.title'),
    t('nutrition.dayIncomplete.missing', { kcal: energy.missingKcal }),
    t('nutrition.dayIncomplete.action'),
    energy.belowFloor ? t('nutrition.dayIncomplete.belowFloor') : null,
  ]
    .filter(Boolean)
    .join('\n');
  return <Banner message={message} />;
}
