import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { deriveJourneyState, type JourneyState } from '@/domain/journey/state';
import { getRecipe } from '@/domain/meals/recipes';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';

import type { Plan } from './usePlan';

/**
 * The single place where the app assembles the user's journey state (CLAUDE.md rule 6).
 * Notifications, the Today screen and later check-ins and progress all read this.
 */
export function useJourneyState(plan: Plan | null): JourneyState | null {
  const { i18n } = useTranslation();
  const completed = useDataStore((s) => s.completedSessions);
  const weights = useDataStore((s) => s.weights);
  const previousMealPlan = useDataStore((s) => s.previousMealPlan);
  const checkins = useNotificationStore((s) => s.checkins);
  const locale = i18n.language === 'en' ? 'en' : 'fr';

  return useMemo(() => {
    if (!plan) return null;
    return deriveJourneyState({
      today: plan.today,
      goal: plan.snapshot.goal.type,
      motivation: plan.snapshot.motivation,
      tone: plan.snapshot.preferences.motivationStyle,
      plannedSessionsPerWeek: plan.snapshot.training.sessionsPerWeek,
      floorKcal: plan.targets.floorKcal,
      sessionDates: completed.map((c) => c.date),
      weights,
      checkins,
      mealPlan: plan.mealPlan,
      previousMealPlan,
      mealName: (id) => getRecipe(id)?.name[locale] ?? null,
      // Same age as the nutrition engine (reference year of today), so both layers agree on "minor".
      age: Number(plan.today.slice(0, 4)) - plan.snapshot.user.birthYear,
      heightCm: plan.snapshot.user.heightCm,
      profileWeightKg: plan.snapshot.user.weightKg,
    });
  }, [plan, completed, weights, checkins, previousMealPlan, locale]);
}
