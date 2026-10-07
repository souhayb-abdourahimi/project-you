import { useEffect, useMemo } from 'react';

import { constraintsFrom } from '@/domain/meals/constraints';
import { planWeekWithDiagnosis as planMeals } from '@/domain/meals/diagnosis';
import { carryOverEaten, mealPlanKey } from '@/domain/meals/planner';
import { assessGoalFeasibility, computeNutritionTargets, noDeficitProfile } from '@/domain/nutrition/engine';
import { planWeek as planSchedule, type PlannedDay, type WeeklyPlan } from '@/domain/planning/engine';
import { appliedCalorieOffset, appliedSessionsPerWeek } from '@/domain/journey/adjustments';
import { evaluateSafety } from '@/domain/journey/safety';
import { journeyStart, loggedDays } from '@/domain/journey/state';
import { weightBasis, withCalorieOffset } from '@/domain/journey/weight-basis';
import { startOfWeek, toIsoDate } from '@/domain/shared/dates';
import { sessionKey } from '@/domain/shared/ids';
import type { SessionVariant } from '@/domain/training/adapt';
import { generateWorkoutPlan, type WorkoutTemplate } from '@/domain/training/engine';
import { durableTraining, structureFor, versionDecisions } from '@/domain/training/structure';
import { activeProgram, ensureProgram, ensureWeek, prescriptionFor, variantTemplate } from '@/domain/training/week';
import { useCalendarStore } from '@/state/calendar';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';

import { useWeights } from './useWeights';

/** Applies user reschedules on top of the engine's weekly plan. */
export function withReschedules(plan: WeeklyPlan, rescheduled: Record<string, string>): WeeklyPlan {
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

/**
 * The schedule of another week (a past week for the review, adherence over 4 weeks). The calendar's
 * busy times are known for the current week only, so they are not applied here.
 */
export function scheduleOfWeek(
  snapshot: {
    schedule: Parameters<typeof planSchedule>[0]['schedule'];
    training: Parameters<typeof planSchedule>[0]['training'];
  },
  weekStart: string,
  rescheduled: Record<string, string>,
): WeeklyPlan {
  return withReschedules(
    planSchedule({ weekStart, schedule: snapshot.schedule, training: snapshot.training }),
    rescheduled,
  );
}

/** Workout slots of a week (after reschedules), the input of `ensureWeek`. */
export function scheduledSessions(plan: WeeklyPlan): { date: string; sessionIndex: number }[] {
  return plan.days.flatMap((d) =>
    d.items.flatMap((i) => (i.kind === 'workout' ? [{ date: d.date, sessionIndex: i.sessionIndex }] : [])),
  );
}

/**
 * Everything the screens need. Training (D-032): BEFORE W-2 the sessions were recomputed from the
 * profile on every render. Now the published prescription is read when it exists; otherwise the
 * engine generates, the app publishes (version + week), then reads it. The engine still proposes
 * the future (`workoutPlan`), it never rewrites a prescription.
 */
export function usePlan() {
  const snapshot = useProfileStore((s) => s.snapshot);
  const inventory = useDataStore((s) => s.inventory);
  const mealPlan = useDataStore((s) => s.mealPlan);
  const setMealPlan = useDataStore((s) => s.setMealPlan);
  const rescheduled = useDataStore((s) => s.rescheduled);
  const calendarBusy = useCalendarStore((s) => (s.connected && s.readBusy ? s.busy : null));
  const adjustments = useDataStore((s) => s.adjustments);
  const previousMealPlan = useDataStore((s) => s.previousMealPlan);
  const completedSessions = useDataStore((s) => s.completedSessions);
  const programs = useDataStore((s) => s.programs);
  const prescriptions = useDataStore((s) => s.prescriptions);
  const superseded = useDataStore((s) => s.superseded);
  const sessionIds = useDataStore((s) => s.sessionIds);
  const setLogs = useDataStore((s) => s.setLogs);
  const sessionOutcomes = useDataStore((s) => s.sessionOutcomes);
  const exerciseSwaps = useDataStore((s) => s.exerciseSwaps);
  const applyTraining = useDataStore((s) => s.applyTraining);
  const weights = useWeights();

  const today = toIsoDate(new Date());
  const weekStart = startOfWeek(today);
  const year = Number(today.slice(0, 4));

  // Safety signals that only need weigh-ins and marked meals (no plan targets): enough to freeze the
  // weight basis without depending on the targets it feeds (docs/ADAPTATION_ENGINE.md §4).
  const frozen = useMemo(() => {
    if (!snapshot) return false;
    const base = computeNutritionTargets(snapshot, year);
    const { flags } = evaluateSafety({
      today,
      loggedDays: loggedDays(previousMealPlan, mealPlan),
      floorKcal: base.floorKcal,
      weights,
      sessionDates: [],
      plannedSessionsPerWeek: snapshot.training.sessionsPerWeek,
      checkins: [],
    });
    return flags.includes('fast_weight_loss') || flags.includes('low_intake');
  }, [snapshot, year, today, previousMealPlan, mealPlan, weights]);

  const startedOn = useMemo(
    () =>
      snapshot
        ? journeyStart(snapshot.createdAt.slice(0, 10), [
            ...weights.map((w) => w.date),
            ...completedSessions.map((c) => c.date),
          ])
        : today,
    [snapshot, weights, completedSessions, today],
  );

  const derived = useMemo(() => {
    if (!snapshot) return null;
    // The plan follows the measured weight (14-day checkpoints) and the adaptations the user accepted.
    const basis = weightBasis({ startedOn, today, profileWeightKg: snapshot.user.weightKg, weights, frozen });
    const sessionsPerWeek = appliedSessionsPerWeek(adjustments) ?? snapshot.training.sessionsPerWeek;
    // Durable changes the user accepted (W-5, D-037): exercises removed, end-of-cycle rotation.
    const training = durableTraining({ ...snapshot.training, sessionsPerWeek }, adjustments);
    const effective = {
      ...snapshot,
      user: { ...snapshot.user, weightKg: basis.weightKg },
      training,
    };
    // An accepted offset never creates a deficit for a minor or an underweight profile.
    const targets = withCalorieOffset(
      computeNutritionTargets(effective, year),
      appliedCalorieOffset(adjustments),
      noDeficitProfile(effective, year),
    );
    const feasibility = assessGoalFeasibility(snapshot, today);
    const workoutPlan = generateWorkoutPlan({ goal: snapshot.goal.type, training: effective.training });
    // Busy times from the user's calendar count as fixed constraints for this week only.
    const busy = calendarBusy?.weekStart === weekStart ? calendarBusy.slots : [];
    const schedule = planSchedule({
      weekStart,
      schedule: { ...snapshot.schedule, fixedConstraints: [...snapshot.schedule.fixedConstraints, ...busy] },
      training: effective.training,
    });
    return { targets, feasibility, workoutPlan, schedule, basis, sessionsPerWeek, startedOn, training };
  }, [snapshot, year, today, weekStart, calendarBusy, adjustments, weights, frozen, startedOn]);

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

  // Publish the version (first one, or a new one when a frozen parameter changed) and freeze the
  // week. Idempotent: nothing is written when the week is already prescribed. Reads the store at
  // run time so several screens using this hook never publish twice.
  useEffect(() => {
    if (!snapshot || !derived || !schedule) return;
    const data = useDataStore.getState();
    const now = new Date().toISOString();
    const nextPrograms = ensureProgram({
      programs: data.programs,
      goal: snapshot.goal.type,
      training: durableTraining({ ...snapshot.training, sessionsPerWeek: derived.sessionsPerWeek }, data.adjustments),
      today,
      weekStart,
      seed: data.ownerId ?? 'local',
      publishedAt: now,
      adjustmentId: versionDecisions(data.adjustments),
    });
    const records = {
      programs: nextPrograms ?? data.programs,
      prescriptions: data.prescriptions,
      superseded: data.superseded,
      sessionIds: data.sessionIds,
    };
    const week = ensureWeek({
      records,
      facts: data,
      rescheduled: data.rescheduled,
      today,
      weekStart,
      scheduled: scheduledSessions(schedule),
      prescribedAt: now,
      // Temporary structures the user accepted (reduced volume, easier variant, restart).
      structure: structureFor(data.adjustments, records, data.completedSessions),
    });
    if (week) applyTraining(week);
    else if (nextPrograms) applyTraining(records);
  }, [
    snapshot,
    derived,
    schedule,
    today,
    weekStart,
    programs,
    prescriptions,
    superseded,
    sessionIds,
    setLogs,
    completedSessions,
    sessionOutcomes,
    exerciseSwaps,
    adjustments,
    applyTraining,
  ]);

  const training = useMemo(
    () => ({
      program: activeProgram(programs),
      /**
       * The session of a day: its frozen prescription when it has one, otherwise the engine's
       * proposal (a session off plan, or a day the program does not cover). Null when the variant
       * has not been prescribed yet.
       */
      sessionTemplate: (
        date: string,
        sessionIndex: number,
        variant: SessionVariant = 'full',
      ): WorkoutTemplate | null => {
        const p = prescriptionFor({ prescriptions, sessionIds }, sessionKey(date, sessionIndex));
        if (p) return variantTemplate(p, variant);
        return variant === 'full' ? (derived?.workoutPlan.sessions[sessionIndex] ?? null) : null;
      },
      prescription: (date: string, sessionIndex: number) =>
        prescriptionFor({ prescriptions, sessionIds }, sessionKey(date, sessionIndex)),
    }),
    [programs, prescriptions, sessionIds, derived],
  );

  if (!snapshot || !derived || !schedule) return null;
  return {
    snapshot,
    today,
    weekStart,
    targets: derived.targets,
    /** Weight the targets use (profile weight until a 14-day checkpoint replaces it). */
    weightBasis: derived.basis,
    /** Sessions per week after accepted adaptations. */
    sessionsPerWeek: derived.sessionsPerWeek,
    /** The profile's training after the durable changes the user accepted (exclusions, rotation). */
    effectiveTraining: derived.training,
    startedOn: derived.startedOn,
    feasibility: derived.feasibility,
    /** The engine's proposal from the current profile (future sessions, rationale). Never the past. */
    workoutPlan: derived.workoutPlan,
    schedule,
    ...training,
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
