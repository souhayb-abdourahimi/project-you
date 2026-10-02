import { SCENARIOS } from '../../scenarios';
import { lightSession, shortSession } from '../adapt';
import { generateWorkoutPlan } from '../engine';
import {
  DIFFICULTY_LEVELS,
  TRAINING_DATA_KINDS,
  adaptPrescription,
  attachLegacySessions,
  difficultyLevel,
  difficultyScore,
  plannedExerciseFor,
  plannedFor,
  prescribeSession,
  programParamsChanged,
  publishProgram,
  reconstructedProgram,
  type RecordedSession,
} from '../program';
import { findReplacements, REPLACEMENT_REASONS } from '../replacement';

const counter = (prefix: string) => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

const training = { ...SCENARIOS.studentMediumBudget.training, refusedExerciseIds: [] as string[] };

function firstProgram(t = training) {
  return publishProgram({
    id: 'p1',
    lineageId: 'lin-1',
    previous: null,
    goal: 'muscle_gain',
    training: t,
    effectiveFrom: '2026-10-05',
    reasonKey: 'program.reason.first',
    publishedAt: '2026-10-05T07:00:00.000Z',
  }).published;
}

describe('program versions', () => {
  it('creates a first engine version with its frozen parameters and a 6-week cycle', () => {
    const p = firstProgram();
    expect(p).toMatchObject({ version: 1, source: 'engine', status: 'active', cycleWeeks: 6, effectiveTo: null });
    expect(p.params).toMatchObject({
      goal: 'muscle_gain',
      sessionsPerWeek: training.sessionsPerWeek,
      sessionMinutes: training.sessionMinutes,
      level: training.level,
    });
    expect(p.params!.split).toHaveLength(training.sessionsPerWeek);
    expect(Object.isFrozen(p) && Object.isFrozen(p.params) && Object.isFrozen(p.params!.equipment)).toBe(true);
  });

  it('publishes v2 in the same lineage and closes v1 without rewriting it', () => {
    const v1 = firstProgram();
    const before = JSON.stringify(v1);
    const { published: v2, closed } = publishProgram({
      id: 'p2',
      lineageId: 'ignored',
      previous: v1,
      goal: 'muscle_gain',
      training: { ...training, sessionsPerWeek: training.sessionsPerWeek - 1 },
      effectiveFrom: '2026-10-19',
      reasonKey: 'program.reason.adjustment',
      adjustmentId: 'adj-1',
      publishedAt: '2026-10-19T07:00:00.000Z',
    });
    expect(v2).toMatchObject({ lineageId: 'lin-1', version: 2, status: 'active', adjustmentId: 'adj-1' });
    expect(closed).toMatchObject({ id: 'p1', status: 'superseded', effectiveTo: '2026-10-18' });
    // Only the lifecycle moved; everything v1 said is still there.
    expect({ ...closed, status: v1.status, effectiveTo: v1.effectiveTo }).toEqual(v1);
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('detects a profile change that requires a new version', () => {
    const v1 = firstProgram();
    expect(programParamsChanged(v1, 'muscle_gain', training)).toBe(false);
    expect(programParamsChanged(v1, 'muscle_gain', { ...training, sessionMinutes: training.sessionMinutes + 15 })).toBe(
      true,
    );
    expect(programParamsChanged(v1, 'muscle_gain', { ...training, refusedExerciseIds: ['push_up'] })).toBe(true);
    expect(programParamsChanged(v1, 'fat_loss', training)).toBe(true);
    // Same equipment in another order is not a change.
    expect(programParamsChanged(v1, 'muscle_gain', { ...training, equipment: [...training.equipment].reverse() })).toBe(
      false,
    );
  });
});

describe('prescriptions', () => {
  const template = () => generateWorkoutPlan({ goal: 'muscle_gain', training }).sessions[0];

  function prescribe() {
    return prescribeSession({
      sessionId: 's1',
      program: firstProgram(),
      template: template(),
      date: '2026-10-05',
      sessionIndex: 0,
      prescribedAt: '2026-10-05T07:00:00.000Z',
      loads: {
        [template().exercises[0].exerciseId]: {
          loadKg: 20,
          action: 'increase_load',
          reasonKey: 'progression.reason.top_of_range',
        },
      },
      ids: counter('pe'),
    });
  }

  it('copies every planned value with its order, purpose and proposed load', () => {
    const s = prescribe();
    const t = template();
    expect(s).toMatchObject({
      programId: 'p1',
      focus: t.focus,
      plannedMinutes: t.estimatedMinutes,
      purpose: 'hypertrophy',
    });
    expect(s.exercises.map((e) => [e.position, e.exerciseId, e.sets, e.repsMin, e.repsMax, e.restSeconds])).toEqual(
      t.exercises.map((e, i) => [i, e.exerciseId, e.sets, e.repsMin, e.repsMax, e.restSeconds]),
    );
    expect(s.exercises[0]).toMatchObject({ targetLoadKg: 20, progressionAction: 'increase_load', variant: 'full' });
    for (const e of s.exercises) expect(e.purpose).toBeTruthy();
  });

  it('never proposes a load it has no basis for', () => {
    const s = prescribe();
    for (const e of s.exercises.slice(1)) {
      expect(e.targetLoadKg).toBeNull();
      expect(e.progressionAction).toBeNull();
      expect(e.progressionReason).toBeNull();
    }
  });

  it('a profile change after the prescription does not change the historical prescription', () => {
    const v1 = firstProgram();
    const s = prescribeSession({
      sessionId: 's1',
      program: v1,
      template: template(),
      date: '2026-10-05',
      sessionIndex: 0,
      prescribedAt: '2026-10-05T07:00:00.000Z',
      ids: counter('pe'),
    });
    const snapshot = JSON.parse(JSON.stringify(s));

    // The user changes their profile: fewer minutes, other equipment, a refused exercise.
    const changed = {
      ...training,
      sessionMinutes: 30,
      equipment: ['bodyweight' as const],
      refusedExerciseIds: [s.exercises[0].exerciseId],
    };
    const { published: v2 } = publishProgram({
      id: 'p2',
      lineageId: 'x',
      previous: v1,
      goal: 'fat_loss',
      training: changed,
      effectiveFrom: '2026-10-07',
      reasonKey: 'program.reason.profile_changed',
      publishedAt: '2026-10-07T07:00:00.000Z',
    });
    const next = prescribeSession({
      sessionId: 's2',
      program: v2,
      template: generateWorkoutPlan({ goal: 'fat_loss', training: changed }).sessions[0],
      date: '2026-10-07',
      sessionIndex: 0,
      prescribedAt: '2026-10-07T07:00:00.000Z',
      ids: counter('pe2'),
    });

    expect(s).toEqual(snapshot);
    expect(Object.isFrozen(s.exercises[0])).toBe(true);
    // Frozen: an accidental write is refused (strict mode) or ignored, never applied.
    try {
      (s.exercises[0] as { sets: number }).sets = 1;
    } catch {
      // strict mode
    }
    expect(s).toEqual(snapshot);
    expect(next.exercises.map((e) => e.exerciseId)).not.toContain(s.exercises[0].exerciseId);
  });

  it('keeps the full prescription and adds the adaptation of the day under its own variant', () => {
    const v1 = firstProgram();
    const s = prescribe();
    const short = shortSession(template(), {
      minutes: 20,
      equipment: ['bodyweight'],
      level: 'intermediate',
      refusedExerciseIds: [],
    });
    const adapted = adaptPrescription({
      session: s,
      program: v1,
      adapted: short,
      minutes: 20,
      reasonKey: 'workout.difficult',
      ids: counter('ad'),
    });
    expect(adapted.exercises.filter((e) => e.variant === 'full')).toEqual(s.exercises);
    expect(adapted.exercises.filter((e) => e.variant === 'short').length).toBe(short.exercises.length);
    expect(adapted).toMatchObject({
      adaptedMinutes: 20,
      adaptationReason: 'workout.difficult',
      plannedMinutes: s.plannedMinutes,
    });
    // A second adaptation to the same variant rewrites nothing.
    const again = adaptPrescription({
      session: adapted,
      program: v1,
      adapted: short,
      minutes: 15,
      reasonKey: 'x',
      ids: counter('z'),
    });
    expect(again).toBe(adapted);
    const light = adaptPrescription({
      session: adapted,
      program: v1,
      adapted: lightSession(template()),
      minutes: 40,
      reasonKey: 'workout.light',
      ids: counter('l'),
    });
    expect(light.adaptedMinutes).toBe(20);
    expect(light.exercises.filter((e) => e.variant === 'light').every((e) => e.purpose === 'recovery')).toBe(true);
  });

  it('refuses to prescribe from a reconstructed program', () => {
    const r = reconstructedProgram({
      id: 'r',
      lineageId: 'lr',
      sessions: [{ id: 'a', date: '2026-09-01', sessionIndex: 0, programId: null, prescriptionSource: null }],
      publishedAt: 'now',
    })!;
    expect(() =>
      prescribeSession({
        sessionId: 's',
        program: r,
        template: template(),
        date: '2026-10-05',
        sessionIndex: 0,
        prescribedAt: 'now',
        ids: counter('x'),
      }),
    ).toThrow();
  });
});

describe('what was done, linked to the prescription', () => {
  const s = prescribeSession({
    sessionId: 's1',
    program: firstProgram(),
    template: generateWorkoutPlan({ goal: 'muscle_gain', training }).sessions[0],
    date: '2026-10-05',
    sessionIndex: 0,
    prescribedAt: 'now',
    ids: counter('pe'),
  });

  it('links a set to its planned exercise, directly or through a replacement', () => {
    const [first, second] = s.exercises;
    expect(plannedExerciseFor(s.exercises, first.exerciseId)?.id).toBe(first.id);
    expect(
      plannedExerciseFor(s.exercises, 'some_other', [
        { fromId: second.exerciseId, toId: 'some_other', reason: 'busy_equipment' },
      ])?.id,
    ).toBe(second.id);
    expect(plannedExerciseFor(s.exercises, 'added_freely')).toBeNull();
  });

  it('shows what was planned per variant, unknown for history, none off plan', () => {
    expect(plannedFor({ prescriptionSource: 'engine' }, s.exercises)).toMatchObject({
      status: 'known',
      variant: 'full',
    });
    expect(plannedFor({ prescriptionSource: 'engine' }, s.exercises, 'light')).toEqual({ status: 'unknown' });
    expect(plannedFor({ prescriptionSource: 'unknown' }, s.exercises)).toEqual({ status: 'unknown' });
    expect(plannedFor({ prescriptionSource: 'off_plan' }, [])).toEqual({ status: 'none' });
  });
});

describe('history recorded before W-1', () => {
  const sessions: RecordedSession[] = [
    { id: 'a', date: '2026-09-10', sessionIndex: 1, programId: null, prescriptionSource: null },
    { id: 'b', date: '2026-09-03', sessionIndex: 0, programId: null, prescriptionSource: null },
    { id: 'c', date: '2026-10-05', sessionIndex: 0, programId: 'p1', prescriptionSource: 'engine' },
  ];

  it('groups legacy sessions under a reconstructed program that invents no parameter', () => {
    const r = reconstructedProgram({ id: 'r', lineageId: 'lr', sessions, publishedAt: 'now' })!;
    expect(r).toMatchObject({
      source: 'reconstructed',
      status: 'ended',
      params: null,
      cycleWeeks: null,
      effectiveFrom: '2026-09-03',
    });
    const attached = attachLegacySessions(sessions, r);
    expect(attached.map((x) => [x.id, x.programId, x.prescriptionSource])).toEqual([
      ['a', 'r', 'unknown'],
      ['b', 'r', 'unknown'],
      ['c', 'p1', 'engine'],
    ]);
    // Attaching twice changes nothing (second device, second run).
    expect(attachLegacySessions(attached, r)).toEqual(attached);
    for (const x of attached.slice(0, 2)) expect(plannedFor(x, [])).toEqual({ status: 'unknown' });
  });

  it('creates nothing when there is no legacy session', () => {
    expect(reconstructedProgram({ id: 'r', lineageId: 'lr', sessions: [sessions[2]], publishedAt: 'now' })).toBeNull();
  });
});

describe('declared data', () => {
  it('maps the five difficulty words to 1–5 and back', () => {
    expect(DIFFICULTY_LEVELS.map(difficultyScore)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5].map(difficultyLevel)).toEqual([...DIFFICULTY_LEVELS]);
    expect(difficultyLevel(0)).toBeNull();
    expect(difficultyLevel(2.5)).toBeNull();
  });

  it('stores no derived value: every stored field is a fact, a declaration or a recommendation', () => {
    expect(Object.values(TRAINING_DATA_KINDS)).not.toContain('derived');
  });

  it('the new replacement reasons never lead to a harder or unavailable exercise', () => {
    const ctx = {
      equipment: SCENARIOS.noGym.training.equipment,
      level: 'intermediate' as const,
      refusedExerciseIds: [],
    };
    for (const reason of ['discomfort', 'too_hard_today'] as const) {
      const current = 'db_bench_press';
      for (const alt of findReplacements(current, reason, ctx)) {
        expect(['beginner', 'intermediate']).toContain(alt.level);
      }
    }
    const busy = findReplacements('db_bench_press', 'busy_equipment', ctx);
    expect(busy.every((e) => !e.equipment.includes('dumbbells'))).toBe(true);
    expect(REPLACEMENT_REASONS).toEqual(
      expect.arrayContaining([
        'busy_equipment',
        'discomfort',
        'cant_do',
        'too_hard_today',
        'no_equipment',
        'no_time',
        'preference',
        'other',
      ]),
    );
  });
});
