import { useEffect, useMemo } from 'react';

import { lightSession, shortSession, type SessionVariant } from '@/domain/training/adapt';
import { shortMinutes } from '@/domain/training/durations';
import type { WorkoutTemplate } from '@/domain/training/engine';
import type { PrescribedSession, TrainingPurpose } from '@/domain/training/program';
import { structureFor } from '@/domain/training/structure';
import { sessionExercises, type SessionExercise } from '@/domain/training/session';
import { adaptSession, variantMinutes, variantTemplate } from '@/domain/training/week';
import type { Plan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

export interface WorkoutRequest {
  /**
   * Which session of the day (its slot): a day can hold two real sessions, each link names its own
   * (W-7.1). Absent: the planned session of the day, else session 0 (a session off plan).
   */
  sessionIndex?: number;
  /** Route params: what the user picked on Today or "Ta journée ne se passe pas comme prévu ?". */
  variant?: SessionVariant;
  minutes?: number;
  /** Today's Daily Coach item, so the screen never asks again what the coach already chose. */
  coach?: { variant: SessionVariant; minutes: number } | null;
}

export interface WorkoutSessionView {
  key: string;
  date: string;
  sessionIndex: number;
  variant: SessionVariant;
  done: boolean;
  /** No prescription that day: the engine's proposal, recorded `off_plan`. */
  offPlan: boolean;
  focus: WorkoutTemplate['focus'];
  purpose: TrainingPurpose | null;
  /** The duration of the variant as prescribed (D-034): the same number the Daily Coach shows. */
  minutes: number;
  exercises: SessionExercise[];
}

/**
 * The session a workout screen shows (W-2 D-032, W-3 D-034). A prescribed day reads its frozen
 * prescription; a short or light version is computed once from that prescription (short: for the
 * minutes announced), stored as its own rows, then read (the full version is never touched). A day
 * without prescription is a session off plan: the engine's proposal is shown, nothing is stored as
 * a prescription. Variant: route > stored choice > today's Daily Coach > planned slot > full.
 */
export function useWorkoutSession(plan: Plan | null, date: string, request: WorkoutRequest = {}) {
  const chooseVariant = useDataStore((s) => s.chooseVariant);
  const openSession = useDataStore((s) => s.openSession);
  const chosen = useDataStore((s) => s.sessionVariants);
  const completedSessions = useDataStore((s) => s.completedSessions);
  const exerciseSwaps = useDataStore((s) => s.exerciseSwaps);
  const adjustments = useDataStore((s) => s.adjustments);

  const day = plan?.schedule.days.find((d) => d.date === date);
  const item = day?.items.find(
    (i) => i.kind === 'workout' && (request.sessionIndex === undefined || i.sessionIndex === request.sessionIndex),
  );
  // A day without a planned session still gets session 0 when the user asked for a short/light version.
  const sessionIndex = request.sessionIndex ?? (item?.kind === 'workout' ? item.sessionIndex : 0);
  const key = `${date}#${sessionIndex}`;
  const prescription = plan?.prescription(date, sessionIndex) ?? null;
  const program = plan?.program ?? null;
  const completed = completedSessions.find((c) => c.date === date && c.sessionIndex === sessionIndex);
  const done = !!completed;
  const coach = plan && date === plan.today ? (request.coach ?? null) : null;
  // A light week the user accepted covers this day: the light version, unless the user picks another.
  const lightWeek = useMemo(
    () => !!structureFor(adjustments, useDataStore.getState(), completedSessions)(date).lightWeek,
    [adjustments, completedSessions, date],
  );
  const variant: SessionVariant =
    completed?.variant ??
    request.variant ??
    chosen[key] ??
    coach?.variant ??
    (lightWeek && item?.kind === 'workout' ? 'light' : undefined) ??
    (item?.kind === 'workout' && item.variant === 'short' ? 'short' : 'full');
  const minutes = request.minutes ?? (coach?.variant === variant ? coach.minutes : undefined);
  // Exclusions include the exercises removed after confirmation (W-5): never proposed again.
  const training = plan?.effectiveTraining;

  const view = useMemo(() => {
    if (!plan || !training) return null;
    if (prescription) {
      const full = variantTemplate(prescription, 'full');
      if (!full) return null;
      const stored = variantTemplate(prescription, variant);
      if (stored || variant === 'full') return { template: full, prescription, adapted: null };
      // Not stored yet: the same computation the effect below stores.
      const adapted = adaptSession({
        session: prescription,
        program,
        variant,
        minutes,
        training,
        done,
        prescribedAt: new Date().toISOString(),
        ...(lightWeek && variant === 'light' ? { reasonKey: 'workout.light_week' } : {}),
      });
      return { template: full, prescription: adapted ?? prescription, adapted };
    }
    const template: WorkoutTemplate | undefined = plan.workoutPlan.sessions[sessionIndex];
    if (!template) return null;
    const session =
      variant === 'short'
        ? shortSession(template, {
            minutes: shortMinutes(minutes, template.estimatedMinutes),
            equipment: training.hasGym ? ['bodyweight'] : training.equipment,
            level: training.level,
            refusedExerciseIds: training.refusedExerciseIds,
          })
        : variant === 'light'
          ? lightSession(template)
          : { exercises: template.exercises, estimatedMinutes: template.estimatedMinutes };
    return {
      template: { ...template, exercises: session.exercises, estimatedMinutes: session.estimatedMinutes },
      prescription: null as PrescribedSession | null,
      adapted: null,
    };
  }, [plan, training, prescription, program, variant, minutes, done, sessionIndex, lightWeek]);

  // Store the variant of the day (and its rows the first time) so every device reads the same.
  const adapted = view?.adapted ?? null;
  useEffect(() => {
    if (!prescription || done) return;
    if (adapted || (chosen[key] ?? 'full') !== variant) chooseVariant(key, variant, adapted);
  }, [prescription, done, adapted, chosen, key, variant, chooseVariant]);

  // Shown on its day (or later): from now on this prescription is what the user saw (D-033).
  const shown = !!view && !!prescription && !done && !!plan && date <= plan.today;
  useEffect(() => {
    if (shown) openSession(key);
  }, [shown, key, openSession]);

  const swaps = exerciseSwaps[key];
  return useMemo((): WorkoutSessionView | null => {
    if (!view) return null;
    const p = view.prescription;
    const rows = p?.exercises.filter((e) => e.variant === variant) ?? [];
    const planned = rows.length > 0 ? rows : (p?.exercises.filter((e) => e.variant === 'full') ?? []);
    return {
      key,
      date,
      sessionIndex,
      // A variant that could not be built (nothing fits) shows the session as prescribed.
      variant: p && rows.length === 0 ? 'full' : variant,
      done,
      offPlan: !prescription,
      focus: view.template.focus,
      purpose: p?.purpose ?? null,
      minutes: p ? variantMinutes(p, rows.length > 0 ? variant : 'full') : view.template.estimatedMinutes,
      exercises: p ? sessionExercises({ planned }, swaps) : sessionExercises({ template: view.template }, swaps),
    };
  }, [view, variant, key, date, sessionIndex, done, prescription, swaps]);
}
