import { useEffect, useMemo } from 'react';

import { constraintsFrom } from '@/domain/meals/constraints';
import { carryOverEaten, mealPlanKey, planWeek as planMeals } from '@/domain/meals/planner';
import { assessGoalFeasibility, computeNutritionTargets } from '@/domain/nutrition/engine';
import { planWeek as planSchedule, type PlannedDay, type WeeklyPlan } from '@/domain/planning/engine';
import { startOfWeek, toIsoDate } from '@/domain/shared/dates';
import { generateWorkoutPlan } from '@/domain/training/engine';
import { useCalendarStore } from '@/state/calendar';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

/** Applies user reschedules on top of the engine's weekly plan. */
function withReschedules(plan: WeeklyPlan, rescheduled: Record<string, string>): WeeklyPlan {
  const moves = Object.entries(rescheduled).filter(([from]) => plan.days.some((d) => d.date === from));
  if (moves.length === 0) return plan;
  const days: PlannedDay[] = plan.days.map((d) => ({ ...d, items: [...d.items] }));
  for (const [from, to] of moves) {
    const source = days.find((d) => d.date === from);
    const target = days.find((d) => d.date === to);
    const workout = source?.items.find((i) => i.kind === 'workout');
    if (!source || !target || !workout) continue;
    source.items = source.items.filter((i) => i !== workout);
    if (!source.items.some((i) => i.kind === 'workout')) source.items.unshift({ kind: 'rest' });
    target.items = [workout, ...target.items.filter((i) => i.kind !== 'rest')];
  }
  return { ...plan, days };
}

/** Everything the screens need, derived from the snapshot by the deterministic engines. */
export function usePlan() {
  const snapshot = useProfileStore((s) => s.snapshot);
  const inventory = useDataStore((s) => s.inventory);
  const mealPlan = useDataStore((s) => s.mealPlan);
  const setMealPlan = useDataStore((s) => s.setMealPlan);
  const rescheduled = useDataStore((s) => s.rescheduled);
  const calendarBusy = useCalendarStore((s) => (s.connected && s.readBusy ? s.busy : null));

  const today = toIsoDate(new Date());
  const weekStart = startOfWeek(today);
  const year = Number(today.slice(0, 4));

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const targets = computeNutritionTargets(snapshot, year);
    const feasibility = assessGoalFeasibility(snapshot, today);
    const workoutPlan = generateWorkoutPlan({ goal: snapshot.goal.type, training: snapshot.training });
    // Busy times from the user's calendar count as fixed constraints for this week only.
    const busy = calendarBusy?.weekStart === weekStart ? calendarBusy.slots : [];
    const schedule = planSchedule({
      weekStart,
      schedule: { ...snapshot.schedule, fixedConstraints: [...snapshot.schedule.fixedConstraints, ...busy] },
      training: snapshot.training,
    });
    return { targets, feasibility, workoutPlan, schedule };
  }, [snapshot, year, today, weekStart, calendarBusy]);

  const planKey = useMemo(
    () =>
      snapshot && derived
        ? mealPlanKey(weekStart, {
            targets: derived.targets,
            constraints: constraintsFrom(snapshot.nutrition, snapshot.lifestyle.kitchen),
            preferences: snapshot.nutrition,
          })
        : null,
    [snapshot, derived, weekStart],
  );

  // Generated once per week and profile (it does not reshuffle as the inventory changes), but a
  // diet, allergy or target change regenerates it, keeping meals already eaten.
  useEffect(() => {
    if (!snapshot || !derived || !planKey || mealPlan?.key === planKey) return;
    const next = planMeals(weekStart, {
      targets: derived.targets,
      constraints: constraintsFrom(snapshot.nutrition, snapshot.lifestyle.kitchen),
      preferences: snapshot.nutrition,
      inventory,
      today,
    });
    setMealPlan(carryOverEaten(next, mealPlan));
  }, [snapshot, derived, planKey, mealPlan, weekStart, inventory, today, setMealPlan]);

  const schedule = useMemo(
    () => (derived ? withReschedules(derived.schedule, rescheduled) : null),
    [derived, rescheduled],
  );

  if (!snapshot || !derived || !schedule) return null;
  return {
    snapshot,
    today,
    weekStart,
    targets: derived.targets,
    feasibility: derived.feasibility,
    workoutPlan: derived.workoutPlan,
    schedule,
    mealPlan: mealPlan?.key === planKey ? mealPlan : null,
    plannerContext: {
      targets: derived.targets,
      constraints: constraintsFrom(snapshot.nutrition, snapshot.lifestyle.kitchen),
      preferences: snapshot.nutrition,
      inventory,
      today,
    },
  };
}

export type Plan = NonNullable<ReturnType<typeof usePlan>>;
