import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  adapt,
  ADAPTATION,
  gateProgression,
  plateau,
  primaryProposal,
  type Recommendation,
} from '@/domain/journey/adaptation';
import { adherence } from '@/domain/journey/adherence';
import { appliedCalorieOffset, appliedDecisions } from '@/domain/journey/adjustments';
import { buildDailyPlan, type DailyPlan } from '@/domain/journey/daily-plan';
import { journeyMemory, type JourneyMemory } from '@/domain/journey/memory';
import { milestoneFacts, milestoneToCelebrate, type MilestoneStatus } from '@/domain/journey/milestones';
import { checkinSignals, type MilestoneRecord } from '@/domain/journey/outcomes';
import type { ProgressData } from '@/domain/journey/progress-facts';
import { buildProgressJourney, type ProgressJourney } from '@/domain/journey/progress-journey';
import { retentionRisk, type RetentionRisk } from '@/domain/journey/retention';
import { deriveJourneyState, type JourneyState } from '@/domain/journey/state';
import {
  activeAdaptations,
  adaptationEffects,
  keptExercises,
  type ActiveAdaptation,
  type AdaptationEffect,
} from '@/domain/journey/structural';
import { structuralSignals } from '@/domain/journey/structural-signals';
import type { VoiceUse } from '@/domain/journey/voice/types';
import { weeklyCheckinDue } from '@/domain/journey/weekly-checkin';
import { summarizeWeek } from '@/domain/meals/budget';
import type { PlannedMeal } from '@/domain/meals/planner';
import { getRecipe } from '@/domain/meals/recipes';
import { addDays, weekdayOf, type IsoDate } from '@/domain/shared/dates';
import { sessionKey } from '@/domain/sync/projection';
import type { SessionVariant } from '@/domain/training/adapt';
import { sessionGoal } from '@/domain/training/session';
import {
  isStructural,
  sessionsDoneUnder,
  structureFor,
  structureKey,
  type StructureOfDay,
} from '@/domain/training/structure';
import { activeProgram, plannedVariantMinutes, progressionSignals, refreshWeek } from '@/domain/training/week';
import { useCalendarStore } from '@/state/calendar';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';

import { scheduleOfWeek, type Plan } from './usePlan';
import { useWeights } from './useWeights';

export interface Journey {
  state: JourneyState;
  daily: DailyPlan;
  progress: ProgressJourney;
  /** The milestone to celebrate today (once, never under safety). */
  celebration: MilestoneStatus | null;
  recommendations: Recommendation[];
  /** The one structural proposal the Daily Coach shows today, if any (D-037 §37). */
  proposal: Recommendation | null;
  /** Structural changes in force today (light week, reduced volume, easier variant, restart). */
  structure: StructureOfDay;
  /** Applied structural changes, before / after, facts only (D-037 §22). */
  effects: AdaptationEffect[];
  /** Structural changes in force today, for the screens (D-037 §38). */
  active: ActiveAdaptation[];
  /** Never stored, never shown: shapes how light the day is. */
  risk: RetentionRisk;
  memory: JourneyMemory;
  /** Days kept in a short, difficult or replaced version (the next morning says so). */
  keptGoingDates: IsoDate[];
}

/** A day counted as tired: the Adaptation Engine's threshold (declared fatigue 4 or 5 out of 5). */
const HIGH_FATIGUE = ADAPTATION.highFatigue;

/** Weeks of past plans read for adherence and the retention score. */
const PAST_WEEKS = 4;

/**
 * The single place where the app assembles the journey (docs/DAILY_COACH.md §2, CLAUDE.md rule 6):
 * state, Daily Coach, Progress Journey, adaptation, retention and memory, all from the same data.
 * Notifications, Today, Mon évolution and the weekly review read this.
 */
export function useJourney(plan: Plan | null): Journey | null {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'fr';
  const weights = useWeights();
  const data = useDataStore();
  const notificationHistory = useNotificationStore((s) => s.history);
  const screenVoice = useNotificationStore((s) => s.screenVoice);
  const weighInDay = useNotificationStore((s) => s.prefs.weighInDay);
  const calendarBusy = useCalendarStore((s) => (s.connected && s.readBusy ? s.busy : null));

  const journey = useMemo((): Journey | null => {
    if (!plan) return null;
    const { today, snapshot } = plan;
    const yesterday = addDays(today, -1);

    // Marked meals: this week's plan, last week's, and the journal of older weeks.
    const planMeals: PlannedMeal[] = [
      ...(data.previousMealPlan?.days.flatMap((d) => d.meals) ?? []),
      ...(plan.mealPlan?.days.flatMap((d) => d.meals) ?? []),
    ];
    const seen = new Set(planMeals.map((m) => m.id));
    const meals = [
      ...planMeals.map((m) => ({ id: m.id, date: m.date, recipeId: m.recipeId, status: m.status, reason: m.reason })),
      ...data.mealLog.filter((m) => !seen.has(m.id)),
    ];

    const lightActivityDates = data.dayLogs.filter((d) => d.activity === 'walk' || d.activity === 'mobility');
    const markedMealDates = meals.filter((m) => m.status !== 'planned').map((m) => m.date);
    const state = deriveJourneyState({
      today,
      startedOn: plan.startedOn,
      otherActivityDates: [...lightActivityDates.map((d) => d.date), ...markedMealDates],
      goal: snapshot.goal.type,
      motivation: snapshot.motivation,
      tone: snapshot.preferences.motivationStyle,
      plannedSessionsPerWeek: plan.sessionsPerWeek,
      floorKcal: plan.targets.floorKcal,
      sessionDates: data.completedSessions.map((c) => c.date),
      weights,
      checkins: checkinSignals(data.dayLogs),
      mealPlan: plan.mealPlan,
      previousMealPlan: data.previousMealPlan,
      mealName: (id) => getRecipe(id)?.name[locale] ?? null,
      // Same age as the nutrition engine (reference year of today), so both layers agree on "minor".
      age: Number(today.slice(0, 4)) - snapshot.user.birthYear,
      heightCm: snapshot.user.heightCm,
      profileWeightKg: snapshot.user.weightKg,
    });

    // Planned sessions of the last weeks (after reschedules) and of this week.
    const weeks = Array.from({ length: PAST_WEEKS }, (_, i) => addDays(plan.weekStart, -7 * (PAST_WEEKS - i)));
    const schedules = [...weeks.map((w) => scheduleOfWeek(snapshot, w, data.rescheduled)), plan.schedule];
    const plannedSessionDates = schedules.flatMap((s) =>
      s.days.filter((d) => d.items.some((i) => i.kind === 'workout')).map((d) => d.date),
    );

    const progressData: ProgressData = {
      completedSessions: data.completedSessions,
      setLogs: data.setLogs,
      weights,
      waist: data.waist,
      measurements: data.measurements,
      dayLogs: data.dayLogs,
      meals,
      weeklyCheckins: data.weeklyCheckins,
    };
    const progress = buildProgressJourney({
      today,
      startedOn: state.journey.startedOn,
      goal: snapshot.goal.type,
      targetWeightKg: snapshot.goal.targetWeightKg ?? null,
      targetDate: snapshot.goal.targetDate ?? null,
      plannedSessionsPerWeek: plan.sessionsPerWeek,
      noPush: state.profile.noPush,
      data: progressData,
      adherence: { plannedSessionDates, sessionOutcomes: data.sessionOutcomes },
    });

    // A milestone whose notification was delivered counts as celebrated on this device too.
    const records: Record<string, MilestoneRecord> = { ...data.milestones };
    for (const e of notificationHistory) {
      const id = e.facts.milestone;
      if (e.trigger === 'milestone_reached' && id && (e.status === 'delivered' || e.status === 'opened')) {
        records[id] = {
          reachedOn: records[id]?.reachedOn ?? e.date,
          celebratedAt: records[id]?.celebratedAt ?? e.date,
        };
      }
    }
    const celebration = milestoneToCelebrate({
      today,
      reached: progress.milestones,
      records,
      safetyActive: state.safety.active,
    });

    const replacedDates = Object.entries(data.sessionOutcomes)
      .filter(([, o]) => o.status === 'replaced')
      .map(([k]) => k.split('#')[0]);
    const keptGoingDates = [
      ...new Set([
        ...data.completedSessions.filter((c) => c.variant !== 'full').map((c) => c.date),
        ...replacedDates,
        ...lightActivityDates.filter((d) => d.mode && d.mode !== 'normal').map((d) => d.date),
      ]),
    ].sort();

    const day = plan.schedule.days.find((d) => d.date === today) ?? null;
    const workout = day?.items.find((i) => i.kind === 'workout');
    const template = workout?.kind === 'workout' ? plan.sessionTemplate(today, workout.sessionIndex) : null;
    const sessionIndex = workout?.kind === 'workout' ? workout.sessionIndex : 0;
    const prescription = template ? plan.prescription(today, sessionIndex) : null;
    const done = data.completedSessions.find((c) => c.date === today);
    const busyToday = calendarBusy?.weekStart === plan.weekStart ? calendarBusy.slots : [];
    const history: VoiceUse[] = [...notificationHistory, ...screenVoice];

    // Structural changes the user accepted, in force today (a light week lasts its 7 days).
    const structureOf = structureFor(data.adjustments, data, data.completedSessions);
    const structure = structureOf(today);
    const lightWeek = structure.lightWeek !== null;
    const daily = buildDailyPlan({
      state,
      day,
      meals: plan.mealPlan?.days.find((d) => d.date === today) ?? null,
      // One duration (D-034): the stored prescription's, the one the workout screen runs.
      session: template
        ? {
            sessionIndex,
            focus: template.focus,
            minutes: prescription?.plannedMinutes ?? snapshot.training.sessionMinutes,
            goal: prescription ? sessionGoal(prescription.exercises) : null,
            ...(prescription
              ? {
                  minutesOf: (v: SessionVariant, requested: number) =>
                    plannedVariantMinutes(prescription, v, requested),
                }
              : {}),
          }
        : null,
      completed: done ? { variant: done.variant } : null,
      outcome: data.sessionOutcomes[sessionKey(today, sessionIndex)] ?? null,
      dayLog: data.dayLogs.find((d) => d.date === today) ?? null,
      freeMinutesToday: null,
      fixedConstraintsToday: [...snapshot.schedule.fixedConstraints, ...busyToday].filter(
        (c) => c.day === weekdayOf(today),
      ).length,
      weighInDay,
      tracksWeight: weights.some((w) => w.date >= addDays(today, -30)),
      weighedToday: weights.some((w) => w.date === today),
      weeklyCheckinDue: weeklyCheckinDue(today, data.weeklyCheckins),
      counts: {
        sessions: progress.sinceStart.sessions,
        activeDays: progress.sinceStart.activeDays,
        weeks: progress.sinceStart.regularity.streakWeeks,
      },
      milestone: celebration ? milestoneFacts(celebration.id) : null,
      keptGoingYesterday: keptGoingDates.includes(yesterday),
      lightWeek,
      history,
    });

    // Adaptation: adherence over 14 and 28 days, the last two full weeks, spending.
    const adherenceInput = {
      today,
      plannedSessionDates,
      completedSessions: data.completedSessions,
      sessionOutcomes: data.sessionOutcomes,
      meals,
    };
    const lastWeeks = [addDays(plan.weekStart, -14), addDays(plan.weekStart, -7)];
    const missedIn = (w: IsoDate) => {
      const inWeek = (d: IsoDate) => d >= w && d <= addDays(w, 6);
      const planned = plannedSessionDates.filter(inWeek).length;
      const doneCount = data.completedSessions.filter((c) => inWeek(c.date)).length;
      const adapted = replacedDates.filter(inWeek).length;
      return Math.max(0, planned - doneCount - adapted);
    };
    const budget = snapshot.budget.weeklyFoodBudgetCents;
    const recentRpes = Object.entries(data.setLogs)
      .filter(([k]) => k.split('#')[0] > addDays(today, -7))
      .flatMap(([, ex]) => Object.values(ex).flatMap((sets) => sets.map((s) => s.rpe)))
      .filter((r): r is number => r !== undefined);
    const adherence14 = adherence(adherenceInput, 14);
    const progression = progressionSignals({ records: data, facts: data, today });
    const fatigueDates = data.dayLogs.filter((d) => (d.fatigue ?? 0) >= HIGH_FATIGUE).map((d) => d.date);
    const adherence28 = adherence(adherenceInput, 28);
    const adaptationInput = {
      today,
      startedOn: state.journey.startedOn,
      goal: snapshot.goal.type,
      safety: { active: state.safety.active, flags: state.safety.flags },
      adherence14,
      adherence28,
      missedPerWeek: [missedIn(lastWeeks[0]), missedIn(lastWeeks[1])] as [number, number],
      weights,
      waist: data.waist,
      trends: progress.performance.exercises,
      setLogs: data.setLogs,
      dayLogs: data.dayLogs,
      rescheduled: data.rescheduled,
      spending:
        budget > 0
          ? (lastWeeks.map((w) => ({
              spentCents: summarizeWeek(budget, data.expenses, w).spentCents,
              budgetCents: budget,
            })) as [{ spentCents: number; budgetCents: number }, { spentCents: number; budgetCents: number }])
          : null,
      targets: plan.targets,
      calorieOffset: appliedCalorieOffset(data.adjustments),
      noDeficit: state.profile.noPush,
      sessionsPerWeek: { profile: snapshot.training.sessionsPerWeek, current: plan.sessionsPerWeek },
      adjustments: data.adjustments,
      progression,
      structural: structuralSignals({
        today,
        adjustments: data.adjustments,
        progression,
        records: data,
        program: activeProgram(data.programs),
        facts: data,
        fatigueDates,
        plannedSessionDates,
        trends: progress.performance.exercises,
      }),
    };
    const recommendations = adapt(adaptationInput);
    const proposal = primaryProposal(recommendations, data.adjustments);
    const effects = adaptationEffects({
      decisions: appliedDecisions(data.adjustments).filter((d) => isStructural(structureKey(d) ?? d.changeKey)),
      today,
      plannedDates: plannedSessionDates,
      doneDates: data.completedSessions.map((c) => c.date),
      fatigueDates,
    });

    const trailingIgnored = (() => {
      const past = notificationHistory
        .filter((e) => e.status === 'delivered' || e.status === 'opened')
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
      let n = 0;
      for (let i = past.length - 1; i >= 0 && past[i].status === 'delivered'; i--) n++;
      return n;
    })();
    const risk = retentionRisk({
      today,
      startedOn: state.journey.startedOn,
      plannedSessionDates,
      completedDates: data.completedSessions.map((c) => c.date),
      sessionOutcomes: data.sessionOutcomes,
      lastActivityBeforeToday: state.momentum.previousActivityDate,
      dayLogs: data.dayLogs,
      weeklyCheckins: data.weeklyCheckins,
      recentRpe: recentRpes.length ? recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length : null,
      plateau: plateau(adaptationInput).active,
      ignoredInARow: trailingIgnored,
    });

    const memory = journeyMemory({
      completedDates: data.completedSessions.map((c) => c.date),
      weighInDates: weights.map((w) => w.date),
      swapReasons: data.swapReasons,
      meals,
      milestones: data.milestones,
      adjustments: data.adjustments,
      confirmed: {
        // The profile's exclusions and the exercises removed after confirmation (W-5).
        refusedExerciseIds: plan.effectiveTraining.refusedExerciseIds,
        dislikedRecipeIds: [],
        likedRecipeIds: [],
      },
      kept: keptExercises(data.adjustments, data.swapReasons, data.keptExercises),
    });

    return {
      state,
      daily,
      progress,
      celebration,
      recommendations,
      proposal,
      structure,
      effects,
      active: activeAdaptations(data.adjustments, today, sessionsDoneUnder(data, data.completedSessions)),
      risk,
      memory,
      keptGoingDates,
    };
  }, [plan, data, weights, notificationHistory, screenVoice, weighInDay, calendarBusy, locale]);

  // Milestones reached are recorded (synced) so that each is celebrated once, on any device.
  const recordMilestones = useDataStore((s) => s.recordMilestones);
  const reached = journey?.progress.milestones;
  useEffect(() => {
    if (!reached) return;
    const known = useDataStore.getState().milestones;
    const added = reached.filter((m) => !known[m.id]);
    if (added.length > 0) recordMilestones(Object.fromEntries(added.map((m) => [m.id, m.reachedOn])));
  }, [reached, recordMilestones]);

  // Progression (W-4, D-035): the sessions of the week not started yet follow the last real
  // sessions, through today's context (safety, fatigue of today, protected profile). Idempotent:
  // nothing is written when the stored prescriptions already say the same.
  const applyTraining = useDataStore((s) => s.applyTraining);
  const safetyActive = journey?.state.safety.active;
  const fatigueHigh = journey?.state.difficulties.fatigue === 'high';
  const noPush = journey?.state.profile.noPush;
  useEffect(() => {
    if (!plan || safetyActive === undefined) return;
    const store = useDataStore.getState();
    const structure = structureFor(store.adjustments, store, store.completedSessions);
    const next = refreshWeek({
      records: store,
      facts: store,
      rescheduled: store.rescheduled,
      today: plan.today,
      weekStart: plan.weekStart,
      gate: (rec, date) => {
        const day = structure(date);
        return gateProgression(rec, {
          safetyActive: !!safetyActive,
          // Today's fatigue says nothing about Friday: only today's session waits.
          fatigueHigh: fatigueHigh && date === plan.today,
          noPush: !!noPush,
          structure: day.volume
            ? (structureKey(day.volume) as 'restart' | 'reduce_volume')
            : day.lightWeek
              ? 'light_week'
              : null,
          date,
        });
      },
      structure,
      prescribedAt: new Date().toISOString(),
    });
    if (next) applyTraining(next);
  }, [plan, data, safetyActive, fatigueHigh, noPush, applyTraining]);

  return journey;
}
