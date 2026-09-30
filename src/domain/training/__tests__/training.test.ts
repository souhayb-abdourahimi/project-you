import { SCENARIOS } from '../../scenarios';
import { lightSession, shortSession } from '../adapt';
import { generateWorkoutPlan } from '../engine';
import { EXERCISES, getExercise, isAvailable } from '../exercises';
import { suggestProgression } from '../progression';
import { findReplacements } from '../replacement';

describe('WorkoutEngine', () => {
  it('builds one session per requested day with a sensible split', () => {
    const plan = generateWorkoutPlan({ goal: 'muscle_gain', training: SCENARIOS.advanced.training });
    expect(plan.sessions.map((s) => s.focus)).toEqual(['upper', 'lower', 'full_a', 'upper', 'lower']);
  });

  it('only uses available equipment and allowed levels', () => {
    const t = SCENARIOS.noGym.training;
    const plan = generateWorkoutPlan({ goal: 'fat_loss', training: { ...t, level: 'beginner' } });
    for (const session of plan.sessions) {
      expect(session.exercises.length).toBeGreaterThanOrEqual(2);
      for (const e of session.exercises) {
        const ex = getExercise(e.exerciseId)!;
        expect(isAvailable(ex, t.equipment)).toBe(true);
        expect(ex.level).toBe('beginner');
      }
    }
  });

  it('never includes refused exercises', () => {
    const plan = generateWorkoutPlan({
      goal: 'maintenance',
      training: { ...SCENARIOS.studentMediumBudget.training, refusedExerciseIds: ['back_squat', 'deadlift', 'bench_press'] },
    });
    const ids = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(ids).not.toContain('back_squat');
    expect(ids).not.toContain('bench_press');
  });

  it('fits the session duration', () => {
    const t = { ...SCENARIOS.studentMediumBudget.training, sessionMinutes: 30 };
    for (const s of generateWorkoutPlan({ goal: 'muscle_gain', training: t }).sessions) {
      expect(s.estimatedMinutes).toBeLessThanOrEqual(35);
    }
  });

  it('rotates variations between repeated sessions', () => {
    const plan = generateWorkoutPlan({ goal: 'muscle_gain', training: SCENARIOS.advanced.training });
    const firstUpper = plan.sessions[0].exercises.map((e) => e.exerciseId);
    const secondUpper = plan.sessions[3].exercises.map((e) => e.exerciseId);
    expect(firstUpper).not.toEqual(secondUpper);
  });
});

describe('replacements', () => {
  const ctx = { equipment: SCENARIOS.noGym.training.equipment, level: 'intermediate' as const, refusedExerciseIds: [] };

  it('keeps the muscle group when a machine is missing', () => {
    const alts = findReplacements('db_bench_press', 'no_equipment', ctx);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts[0].pattern).toBe('push_horizontal');
    for (const a of alts) expect(a.equipment).not.toContain('dumbbells');
  });

  it('offers easier and harder variations', () => {
    const easier = findReplacements('push_up', 'easier', ctx);
    expect(easier.map((e) => e.id)).toContain('incline_push_up');
    const harder = findReplacements('bodyweight_squat', 'harder', { ...ctx, equipment: ['bodyweight', 'dumbbells', 'bench'] });
    expect(harder.length).toBeGreaterThan(0);
    for (const h of harder) expect(h.level !== 'beginner' || h.loadIncrementKg > 0).toBe(true);
  });

  it('never proposes a refused exercise', () => {
    const alts = findReplacements('push_up', 'dislike', { ...ctx, refusedExerciseIds: ['incline_push_up'] });
    expect(alts.map((e) => e.id)).not.toContain('incline_push_up');
  });

  it('every exercise has cues and mistakes in both languages', () => {
    for (const e of EXERCISES) {
      expect(e.cues.fr && e.cues.en && e.mistakes.fr && e.mistakes.en).toBeTruthy();
    }
  });
});

describe('ProgressionEngine', () => {
  const base = { exerciseId: 'goblet_squat', repsMin: 8, repsMax: 12, fatigue: 'normal' as const };

  it('adds load at the top of the range with manageable effort', () => {
    const s = suggestProgression({ ...base, history: [{ date: 'd1', sets: [{ reps: 12, loadKg: 20, rpe: 8 }, { reps: 12, loadKg: 20, rpe: 8.5 }] }] });
    expect(s).toMatchObject({ action: 'increase_load', loadKg: 22, targetReps: 8 });
  });

  it('adds reps inside the range', () => {
    const s = suggestProgression({ ...base, history: [{ date: 'd1', sets: [{ reps: 9, loadKg: 20, rpe: 8 }] }] });
    expect(s).toMatchObject({ action: 'add_reps', loadKg: 20, targetReps: 10 });
  });

  it('does not increase when fatigue is high', () => {
    const s = suggestProgression({ ...base, fatigue: 'high', history: [{ date: 'd1', sets: [{ reps: 12, loadKg: 20, rpe: 7 }] }] });
    expect(s.action).toBe('keep');
  });

  it('does not increase at maximal effort', () => {
    const s = suggestProgression({ ...base, history: [{ date: 'd1', sets: [{ reps: 12, loadKg: 20, rpe: 10 }] }] });
    expect(s.action).toBe('keep');
  });

  it('deloads after two missed sessions', () => {
    const miss = { date: 'd', sets: [{ reps: 6, loadKg: 30 }] };
    const s = suggestProgression({ ...base, history: [miss, miss] });
    expect(s).toMatchObject({ action: 'deload', loadKg: 27 });
  });
});

describe('adapted sessions', () => {
  const plan = generateWorkoutPlan({ goal: 'muscle_gain', training: SCENARIOS.studentMediumBudget.training });

  it('"J\'ai 15 minutes" gives a home bodyweight circuit', () => {
    const s = shortSession(plan.sessions[0], { minutes: 15, equipment: ['bodyweight'], level: 'intermediate', refusedExerciseIds: [] });
    expect(s.variant).toBe('short');
    expect(s.exercises.length).toBeGreaterThanOrEqual(2);
    expect(s.estimatedMinutes).toBeLessThanOrEqual(15);
    for (const e of s.exercises) expect(getExercise(e.exerciseId)!.equipment).toEqual(['bodyweight']);
  });

  it('light version reduces volume and effort', () => {
    const l = lightSession(plan.sessions[0]);
    l.exercises.forEach((e, i) => {
      expect(e.sets).toBeLessThanOrEqual(plan.sessions[0].exercises[i].sets);
      expect(e.targetRpe).toBeLessThanOrEqual(6);
    });
  });
});
