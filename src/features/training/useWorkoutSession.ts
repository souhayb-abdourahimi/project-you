import { useEffect, useMemo } from 'react';

import { lightSession, shortSession, type SessionVariant } from '@/domain/training/adapt';
import type { WorkoutTemplate } from '@/domain/training/engine';
import { adaptSession, SHORT_SESSION_MINUTES, variantTemplate } from '@/domain/training/week';
import type { Plan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

/**
 * The session a workout screen shows (W-2, D-032). A prescribed day reads its frozen prescription;
 * a short or light version is computed once from that prescription, stored as its own rows, then
 * read (the full version is never touched). A day without prescription is a session off plan: the
 * engine's proposal is shown and nothing is stored as a prescription.
 */
export function useWorkoutSession(plan: Plan | null, date: string, variantParam?: SessionVariant) {
  const chooseVariant = useDataStore((s) => s.chooseVariant);
  const openSession = useDataStore((s) => s.openSession);
  const chosen = useDataStore((s) => s.sessionVariants);
  const completedSessions = useDataStore((s) => s.completedSessions);

  const day = plan?.schedule.days.find((d) => d.date === date);
  const item = day?.items.find((i) => i.kind === 'workout');
  // A day without a planned session still gets session 0 when the user asked for a short/light version.
  const sessionIndex = item?.kind === 'workout' ? item.sessionIndex : 0;
  const key = `${date}#${sessionIndex}`;
  const prescription = plan?.prescription(date, sessionIndex) ?? null;
  const program = plan?.program ?? null;
  const done = completedSessions.some((c) => c.date === date && c.sessionIndex === sessionIndex);
  const variant: SessionVariant =
    variantParam ?? chosen[key] ?? (item?.kind === 'workout' && item.variant === 'short' ? 'short' : 'full');
  const training = plan?.snapshot.training;

  const view = useMemo(() => {
    if (!plan || !training) return null;
    if (prescription) {
      const full = variantTemplate(prescription, 'full');
      if (!full) return null;
      const stored = variantTemplate(prescription, variant);
      if (stored || variant === 'full') return { template: full, session: stored ?? full, adapted: null };
      // Not stored yet: the same computation the effect below stores.
      const adapted = adaptSession({
        session: prescription,
        program,
        variant,
        training,
        done,
        prescribedAt: new Date().toISOString(),
      });
      const session = adapted ? variantTemplate(adapted, variant) : null;
      return { template: full, session: session ?? full, adapted };
    }
    const template: WorkoutTemplate | undefined = plan.workoutPlan.sessions[sessionIndex];
    if (!template) return null;
    const session =
      variant === 'short'
        ? shortSession(template, {
            minutes: SHORT_SESSION_MINUTES,
            equipment: training.hasGym ? ['bodyweight'] : training.equipment,
            level: training.level,
            refusedExerciseIds: training.refusedExerciseIds,
          })
        : variant === 'light'
          ? lightSession(template)
          : { exercises: template.exercises, estimatedMinutes: template.estimatedMinutes };
    return { template, session, adapted: null };
  }, [plan, training, prescription, program, variant, done, sessionIndex]);

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

  return view
    ? {
        key,
        sessionIndex,
        variant,
        done,
        offPlan: !prescription,
        focus: view.template.focus,
        exercises: view.session.exercises,
        estimatedMinutes: view.session.estimatedMinutes,
      }
    : null;
}
