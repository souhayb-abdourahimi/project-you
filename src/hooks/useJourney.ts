import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { adapt, plateau, type Recommendation } from '@/domain/journey/adaptation';
import { adherence } from '@/domain/journey/adherence';
import { appliedCalorieOffset } from '@/domain/journey/adjustments';
import { buildDailyPlan, type DailyPlan } from '@/domain/journey/daily-plan';
import { journeyMemory, type JourneyMemory } from '@/domain/journey/memory';
import { milestoneFacts, milestoneToCelebrate, type MilestoneStatus } from '@/domain/journey/milestones';
import { checkinSignals, type MilestoneRecord } from '@/domain/journey/outcomes';
import type { ProgressData } from '@/domain/journey/progress-facts';
import { buildProgressJourney, type ProgressJourney } from '@/domain/journey/progress-journey';
import { retentionRisk, type RetentionRisk } from '@/domain/journey/retention';
import { deriveJourneyState, type JourneyState } from '@/domain/journey/state';
import type { VoiceUse } from '@/domain/journey/voice/types';
import { weeklyCheckinDue } from '@/domain/journey/weekly-checkin';
import { summarizeWeek } from '@/domain/meals/budget';
import type { PlannedMeal } from '@/domain/meals/planner';
import { getRecipe } from '@/domain/meals/recipes';
import { addDays, weekdayOf, type IsoDate } from '@/domain/shared/dates';
import { sessionKey } from '@/domain/sync/projection';
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
  /** Never stored, never shown: shapes how light the day is. */
  risk: RetentionRisk;
  memory: JourneyMemory;
  /** Days kept in a short, difficult or replaced version (the next morning says so). */
  keptGoingDates: IsoDate[];
}

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
    const template = workout?.kind === 'workout' ? plan.workoutPlan.sessions[workout.sessionIndex] : undefined;
    const sessionIndex = workout?.kind === 'workout' ? workout.sessionIndex : 0;
    const done = data.completedSessions.find((c) => c.date === today);
    const busyToday = calendarBusy?.weekStart === plan.weekStart ? calendarBusy.slots : [];
    const history: VoiceUse[] = [...notificationHistory, ...screenVoice];

    const daily = buildDailyPlan({
      state,
      day,
      meals: plan.mealPlan?.days.find((d) => d.date === today) ?? null,
      session: template ? { sessionIndex, focus: template.focus, minutes: snapshot.training.sessionMinutes } : null,
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
      sessionsPerWeek: { profile: snapshot.training.sessionsPerWeek, current: plan.sessionsPerWeek },
      adjustments: data.adjustments,
    };
    const recommendations = adapt(adaptationInput);

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
        refusedExerciseIds: snapshot.training.refusedExerciseIds,
        dislikedRecipeIds: [],
        likedRecipeIds: [],
      },
    });

    return { state, daily, progress, celebration, recommendations, risk, memory, keptGoingDates };
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

  return journey;
}
