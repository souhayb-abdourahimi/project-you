import { gateProgression } from '../../journey/adaptation';
import { decisionFor, revertDecision, type Adjustment } from '../../journey/adjustments';
import { SCENARIOS } from '../../scenarios';
import { EMPTY_FACTS, publishWeek, scheduledWeek } from '../../scenarios/training';
import { addDays } from '../../shared/dates';
import { sessionKey } from '../../shared/ids';
import { EASIER_VARIANTS, EXERCISES, easierVariants, getExercise, harderVariants, LEVEL_RANK } from '../exercises';
import {
  adaptationOfDay,
  covers,
  cycleEvolution,
  cycleState,
  durableTraining,
  easierVariantFor,
  exercisePatterns,
  incompleteSessions,
  replacementPreview,
  sessionsDoneUnder,
  shapeTemplate,
  STRUCTURE,
  structureFor,
  structureOn,
  trainingBreak,
  versionDecisions,
} from '../structure';
import {
  activeProgram,
  ensureProgram,
  ensureWeek,
  prescriptionFor,
  refreshWeek,
  versionTemplates,
  type TrainingFacts,
  type TrainingRecords,
} from '../week';

/** W-5 (D-037): what an accepted structural change does to the sessions; never the past. */

const SNAP = SCENARIOS.muscleGain;
const WEEK = '2026-09-28';
const SEED = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-28T07:00:00.000Z';

let n = 0;
const decide = (
  key: string,
  patch: { from?: string; to?: string | number; status?: 'applied' | 'declined' | 'postponed'; today?: string } = {},
  scope: Parameters<typeof decisionFor>[0]['proposal']['scope'] = null,
): Adjustment =>
  decisionFor({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    proposal: {
      id: `training:${key}:${WEEK}`,
      kind: key === 'light_week' || key === 'restart' || key === 'reduce_volume' ? 'reduce_load' : 'training',
      change: { key, ...(patch.from ? { from: patch.from } : {}), ...(patch.to !== undefined ? { to: patch.to } : {}) },
      reason: { key: `adaptation.reason.${key}` },
      evidence: {},
      scope,
    },
    status: patch.status ?? 'applied',
    today: patch.today ?? WEEK,
    decidedAt: `${patch.today ?? WEEK}T09:00:00.000Z`,
  });

const volume = (today = WEEK) => decide('reduce_volume', { to: -1, today }, { kind: 'weeks', days: 14 });
const restart = (today = WEEK) =>
  decide('restart', { to: 2, today }, { kind: 'sessions', sessions: 2, days: STRUCTURE.restartMaxDays });
const easier = (from: string, to: string, today = WEEK) =>
  decide('easier_variant', { from, to, today }, { kind: 'sessions', sessions: 2, days: 21 });

const week = () => publishWeek(SNAP, { facts: EMPTY_FACTS, today: WEEK, weekStart: WEEK, seed: SEED, at: AT });
const fullRows = (r: TrainingRecords, key: string) =>
  prescriptionFor(r, key)!.exercises.filter((e) => e.variant === 'full');

describe('catalogue: easier variants are structured relations, never names', () => {
  it('every pair exists, keeps the movement pattern and is never harder', () => {
    for (const [from, tos] of Object.entries(EASIER_VARIANTS)) {
      const a = getExercise(from)!;
      expect(a).toBeDefined();
      for (const to of tos) {
        const b = getExercise(to)!;
        expect(b).toBeDefined();
        expect(b.pattern).toBe(a.pattern);
        expect(LEVEL_RANK[b.level]).toBeLessThanOrEqual(LEVEL_RANK[a.level]);
        expect(to).not.toBe(from);
      }
    }
  });

  it('harder variants are the inverse relation', () => {
    expect(easierVariants('back_squat').map((e) => e.id)).toEqual(['goblet_squat', 'leg_press']);
    expect(harderVariants('goblet_squat').map((e) => e.id)).toContain('back_squat');
    for (const e of EXERCISES) for (const h of harderVariants(e.id)) expect(EASIER_VARIANTS[h.id]).toContain(e.id);
  });

  it('a variant is only offered with the equipment and never when excluded; none is invented', () => {
    expect(easierVariantFor('back_squat', { equipment: ['barbell', 'dumbbells'], excluded: [] })).toBe('goblet_squat');
    expect(easierVariantFor('back_squat', { equipment: ['barbell', 'dumbbells'], excluded: ['goblet_squat'] })).toBe(
      null,
    );
    expect(easierVariantFor('plank', { equipment: ['bodyweight'], excluded: [] })).toBeNull();
  });
});

describe('scope: every change has a known end', () => {
  it('a week covers 7 days; a sessions scope ends after its sessions or its maximum', () => {
    const light = decide('light_week', { to: 'light' }, { kind: 'week', days: 7 });
    expect(light.effectiveTo).toBe(addDays(WEEK, 6));
    expect(covers(light, addDays(WEEK, 6))).toBe(true);
    expect(covers(light, addDays(WEEK, 7))).toBe(false);
    const r = restart();
    expect(covers(r, addDays(WEEK, 3), { [r.id]: 1 })).toBe(true);
    expect(covers(r, addDays(WEEK, 3), { [r.id]: 2 })).toBe(false);
    expect(covers(r, addDays(WEEK, STRUCTURE.restartMaxDays))).toBe(false);
  });

  it('a light week decided before W-5 (no end stored) still lasts 7 days', () => {
    const legacy: Adjustment = { ...decide('light_week', { to: 'light' }), effectiveTo: null, scope: null };
    expect(structureOn([legacy], addDays(WEEK, 6)).lightWeek).not.toBeNull();
    expect(structureOn([legacy], addDays(WEEK, 7)).lightWeek).toBeNull();
  });

  it('a declined, postponed or reverted change is not in force', () => {
    const v = volume();
    expect(structureOn([v], WEEK).volume?.id).toBe(v.id);
    expect(structureOn([decide('reduce_volume', { status: 'declined' })], WEEK).volume).toBeNull();
    expect(structureOn([decide('reduce_volume', { status: 'postponed' })], WEEK).volume).toBeNull();
    const back = revertDecision(v, { id: 'r1', today: addDays(WEEK, 2), decidedAt: `${addDays(WEEK, 2)}T10:00:00Z` });
    expect(structureOn([v, back], addDays(WEEK, 3)).volume).toBeNull();
  });

  it('restart wins over reduced volume (both remove a set, restart also lowers the load)', () => {
    const v = volume();
    const r = restart();
    expect(structureOn([v, r], WEEK).volume?.id).toBe(r.id);
  });
});

describe('shapeTemplate: a real, documented representation', () => {
  const template = {
    index: 0,
    focus: 'full_a' as const,
    estimatedMinutes: 40,
    exercises: [
      {
        exerciseId: 'back_squat',
        sets: 4,
        repsMin: 6,
        repsMax: 10,
        unit: 'reps' as const,
        restSeconds: 120,
        targetRpe: 8,
        alternatives: ['goblet_squat'],
      },
      {
        exerciseId: 'bench_press',
        sets: 3,
        repsMin: 6,
        repsMax: 10,
        unit: 'reps' as const,
        restSeconds: 120,
        targetRpe: 8,
        alternatives: [],
      },
      {
        exerciseId: 'plank',
        sets: 2,
        repsMin: 30,
        repsMax: 45,
        unit: 'seconds' as const,
        restSeconds: 60,
        targetRpe: 8,
        alternatives: [],
      },
    ],
  };
  const ctx = { equipment: SNAP.training.equipment, excluded: [] };

  it('reduced volume: 4 → 3, 3 → 2, never under the minimum', () => {
    const v = volume();
    const { template: t, adjustmentId } = shapeTemplate(template, { lightWeek: null, volume: v, easier: [] }, ctx);
    expect(t.exercises.map((e) => e.sets)).toEqual([3, 2, 2]);
    expect(adjustmentId).toBe(v.id);
    expect(t.estimatedMinutes).toBeLessThan(template.estimatedMinutes);
    expect(t.exercises.map((e) => e.targetRpe)).toEqual([8, 8, 8]);
  });

  it('restart: one set fewer and a moderate target effort', () => {
    const r = restart();
    const { template: t } = shapeTemplate(template, { lightWeek: null, volume: r, easier: [] }, ctx);
    expect(t.exercises.map((e) => e.sets)).toEqual([3, 2, 2]);
    expect(t.exercises.every((e) => e.targetRpe <= STRUCTURE.restartRpe)).toBe(true);
  });

  it('easier variant: same sets and range, the row keeps the exercise it stands for', () => {
    const d = easier('back_squat', 'goblet_squat');
    const { template: t, adjustmentId } = shapeTemplate(template, { lightWeek: null, volume: null, easier: [d] }, ctx);
    expect(t.exercises[0]).toMatchObject({ exerciseId: 'goblet_squat', standsFor: 'back_squat', sets: 4, repsMin: 6 });
    expect(adjustmentId).toBe(d.id);
  });

  it('a variant the equipment does not allow, or excluded, is not used (nothing changes)', () => {
    const d = easier('back_squat', 'goblet_squat');
    const res = shapeTemplate(
      template,
      { lightWeek: null, volume: null, easier: [d] },
      { ...ctx, excluded: ['goblet_squat'] },
    );
    expect(res.adjustmentId).toBeNull();
    expect(res.template).toBe(template);
  });

  it('a light week changes nothing here (the light variant and the progression gate carry it)', () => {
    const light = decide('light_week', { to: 'light' }, { kind: 'week', days: 7 });
    expect(shapeTemplate(template, { lightWeek: light, volume: null, easier: [] }, ctx).adjustmentId).toBeNull();
  });
});

describe('the week follows accepted changes; the past never moves (D-033)', () => {
  it('reduced volume accepted: sessions not started are prescribed again, linked to the decision', () => {
    const records = week();
    const before = fullRows(records, sessionKey('2026-09-30', 1)).map((e) => e.sets);
    const v = volume();
    const next = refreshWeek({
      records,
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: WEEK,
      weekStart: WEEK,
      prescribedAt: `${WEEK}T10:00:00.000Z`,
      structure: structureFor([v], records, []),
    })!;
    expect(next).not.toBeNull();
    const after = prescriptionFor(next, sessionKey('2026-09-30', 1))!;
    expect(after.adjustmentId).toBe(v.id);
    expect(after.exercises.filter((e) => e.variant === 'full').map((e) => e.sets)).toEqual(
      before.map((s) => (s > STRUCTURE.minSets ? s - 1 : s)),
    );
    // Revert: a new decision, and the next refresh gives the usual volume back.
    const back = revertDecision(v, { id: 'rev', today: WEEK, decidedAt: `${WEEK}T11:00:00.000Z` });
    const again = refreshWeek({
      records: next,
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: WEEK,
      weekStart: WEEK,
      prescribedAt: `${WEEK}T12:00:00.000Z`,
      structure: structureFor([v, back], next, []),
    })!;
    const restored = prescriptionFor(again, sessionKey('2026-09-30', 1))!;
    expect(restored.adjustmentId).toBeUndefined();
    expect(restored.exercises.filter((e) => e.variant === 'full').map((e) => e.sets)).toEqual(before);
  });

  it('a session already done keeps what it was given', () => {
    const records = week();
    const monday = sessionKey('2026-09-28', 0);
    const facts: TrainingFacts = {
      ...EMPTY_FACTS,
      setLogs: { [monday]: { [fullRows(records, monday)[0].exerciseId]: [{ reps: 8, loadKg: 60 }] } },
      completedSessions: [{ date: '2026-09-28', sessionIndex: 0, variant: 'full' }],
    };
    const v = volume();
    const next = refreshWeek({
      records,
      facts,
      rescheduled: {},
      today: '2026-09-29',
      weekStart: WEEK,
      prescribedAt: '2026-09-29T10:00:00.000Z',
      structure: structureFor([v], records, facts.completedSessions),
    })!;
    expect(prescriptionFor(next, monday)).toEqual(prescriptionFor(records, monday));
  });

  it('a new week published under a change in force is prescribed with it from the start', () => {
    const v = volume('2026-09-27');
    const records = ensureWeek({
      records: { ...week(), sessionIds: {}, prescriptions: {} },
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: WEEK,
      weekStart: WEEK,
      scheduled: scheduledWeek(SNAP, WEEK),
      prescribedAt: AT,
      structure: structureFor([v], { prescriptions: {}, sessionIds: {} }, []),
    })!;
    expect(prescriptionFor(records, sessionKey('2026-09-30', 1))!.adjustmentId).toBe(v.id);
  });

  it('a sessions scope ends once its sessions are done', () => {
    const records = week();
    const r = restart();
    const shaped = refreshWeek({
      records,
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: WEEK,
      weekStart: WEEK,
      prescribedAt: `${WEEK}T10:00:00.000Z`,
      structure: structureFor([r], records, []),
    })!;
    const done = [
      { date: '2026-09-28', sessionIndex: 0 },
      { date: '2026-09-30', sessionIndex: 1 },
    ];
    expect(sessionsDoneUnder(shaped, done)[r.id]).toBe(2);
    expect(structureFor([r], shaped, done)('2026-10-02').volume).toBeNull();
  });

  it('light week: the day says so, and nothing goes up', () => {
    const light = decide('light_week', { to: 'light' }, { kind: 'week', days: 7 });
    const day = structureOn([light], '2026-09-30');
    expect(adaptationOfDay([light], null, day)).toBe('light_week');
  });
});

describe('progression gate under a structure (micro rules, D-036)', () => {
  const rec = (action: 'increase_load' | 'increase_reps' | 'maintain', lastDate = '2026-09-25') => ({
    exerciseId: 'bench_press',
    action,
    reason: { key: 'progression.reason.top_confirmed', params: {} },
    proposedPrescription: { sets: 3, repsMin: 6, repsMax: 10, unit: 'reps' as const, loadKg: 72.5, target: 6 },
    evidence: { used: [{ date: lastDate }], last: { loadKg: 70, value: 10 } },
    signals: {},
  });
  const ctx = { safetyActive: false, fatigueHigh: false, noPush: false };
  type Rec = Parameters<typeof gateProgression>[0];

  it('light week and reduced volume hold the load', () => {
    expect(gateProgression(rec('increase_load') as unknown as Rec, { ...ctx, structure: 'light_week' })).toMatchObject({
      action: 'maintain',
      blockedBy: 'deload',
      proposedPrescription: { loadKg: 70 },
    });
    expect(
      gateProgression(rec('increase_reps') as unknown as Rec, { ...ctx, structure: 'reduce_volume' }).blockedBy,
    ).toBe('volume');
  });

  it('restart: one step under the last real load, bottom of the range', () => {
    const r = gateProgression(rec('maintain') as unknown as Rec, { ...ctx, structure: 'restart' });
    expect(r.action).toBe('reduce_load');
    expect(r.proposedPrescription.loadKg).toBe(70 - (getExercise('bench_press')!.loadIncrementKg ?? 0));
    expect(r.proposedPrescription.target).toBe(6);
  });

  it('after a long break nothing goes up yet, even without an accepted restart', () => {
    const r = gateProgression(rec('increase_load', '2026-09-01') as unknown as Rec, {
      ...ctx,
      date: '2026-09-30',
      lastSessionDate: '2026-09-01',
    });
    expect(r.blockedBy).toBe('break');
    // Light or short sessions in between: no break, the progression goes on.
    const kept = gateProgression(rec('increase_load', '2026-09-01') as unknown as Rec, {
      ...ctx,
      date: '2026-09-30',
      lastSessionDate: '2026-09-28',
    });
    expect(kept.action).toBe('increase_load');
  });
});

describe('facts read by the structural rules', () => {
  it('temporary reasons never count as a preference', () => {
    const p = exercisePatterns(
      {
        swapReasons: {
          [sessionKey('2026-09-21', 0)]: { bench_press: 'busy_equipment' },
          [sessionKey('2026-09-23', 0)]: { bench_press: 'preference', pull_up: 'discomfort' },
          [sessionKey('2026-09-25', 0)]: { bench_press: 'dislike', pull_up: 'discomfort' },
        },
      },
      WEEK,
    );
    expect(p).toEqual([
      {
        exerciseId: 'bench_press',
        category: 'preference',
        keys: [sessionKey('2026-09-23', 0), sessionKey('2026-09-25', 0)],
      },
      { exerciseId: 'bench_press', category: 'temporary', keys: [sessionKey('2026-09-21', 0)] },
      { exerciseId: 'pull_up', category: 'safety', keys: [sessionKey('2026-09-23', 0), sessionKey('2026-09-25', 0)] },
    ]);
  });

  it('a break is measured from the last session done', () => {
    expect(trainingBreak([{ date: '2026-09-01' }, { date: '2026-09-10' }], WEEK)).toEqual({
      lastDate: '2026-09-10',
      days: 18,
      sessionsBefore: 2,
    });
    expect(trainingBreak([], WEEK)).toBeNull();
  });

  it('incomplete sessions: sets missing on several exercises, not for time, not tired', () => {
    const records = week();
    const keys = [sessionKey('2026-09-28', 0), sessionKey('2026-09-30', 1), sessionKey('2026-10-02', 2)];
    const setLogs = Object.fromEntries(
      keys.map((k) => [
        k,
        Object.fromEntries(fullRows(records, k).map((e) => [e.exerciseId, [{ reps: 8, loadKg: 20 }]])),
      ]),
    );
    const completed = keys.map((k, i) => ({ date: k.split('#')[0], sessionIndex: i, variant: 'full' }));
    const read = (patch: Partial<Parameters<typeof incompleteSessions>[0]> = {}) =>
      incompleteSessions({
        records,
        facts: { setLogs, completedSessions: completed },
        fatigueDates: new Set(),
        today: '2026-10-02',
        ...patch,
      });
    expect(read()).toEqual({ incomplete: 3, of: 3 });
    expect(
      read({ facts: { setLogs, completedSessions: completed.map((c) => ({ ...c, stopped: 'no_time' })) } }),
    ).toEqual({ incomplete: 0, of: 0 });
    expect(read({ fatigueDates: new Set(['2026-09-28', '2026-09-30']) })).toEqual({ incomplete: 1, of: 1 });
  });
});

describe('durable changes: a new program version, only after confirmation', () => {
  it('an applied exercise change excludes the exercise; a declined one changes nothing', () => {
    const applied = decide('exercise_change', { from: 'bench_press', to: 'db_bench_press' }, { kind: 'durable' });
    expect(durableTraining(SNAP.training, [applied]).refusedExerciseIds).toContain('bench_press');
    const declined = decide('exercise_change', { from: 'bench_press', status: 'declined' });
    expect(durableTraining(SNAP.training, [declined]).refusedExerciseIds).not.toContain('bench_press');
  });

  it('the preview is what the next version really puts in the slot', () => {
    const records = week();
    const params = activeProgram(records.programs)!.params!;
    const to = replacementPreview(params, 'bench_press');
    expect(to).not.toBeNull();
    const applied = decide('exercise_change', { from: 'bench_press', ...(to ? { to } : {}) }, { kind: 'durable' });
    const programs = ensureProgram({
      programs: records.programs,
      goal: SNAP.goal.type,
      training: durableTraining(SNAP.training, [applied]),
      today: '2026-09-30',
      weekStart: WEEK,
      seed: SEED,
      publishedAt: '2026-09-30T09:00:00.000Z',
      adjustmentId: versionDecisions([applied]),
    })!;
    const next = activeProgram(programs)!;
    expect(next.version).toBe(2);
    expect(next.reasonKey).toBe('program.reason.adaptation');
    expect(next.adjustmentId).toBe(applied.id);
    const exercises = versionTemplates(next).flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(exercises).not.toContain('bench_press');
    expect(exercises).toContain(to);
    // Reverted: a new decision, a new version that brings it back (never a rewrite).
    const back = revertDecision(applied, { id: 'rev2', today: '2026-10-01', decidedAt: '2026-10-01T09:00:00.000Z' });
    const v3 = ensureProgram({
      programs,
      goal: SNAP.goal.type,
      training: durableTraining(SNAP.training, [applied, back]),
      today: '2026-10-01',
      weekStart: WEEK,
      seed: SEED,
      publishedAt: '2026-10-01T09:00:00.000Z',
      adjustmentId: versionDecisions([applied, back]),
    })!;
    expect(activeProgram(v3)).toMatchObject({ version: 3, adjustmentId: 'rev2' });
    expect(v3.find((p) => p.version === 2)).toMatchObject({ status: 'superseded' });
  });

  it('end of cycle: the cycle restarts at each answer; an evolution rotates only what changes', () => {
    const records = week();
    const program = activeProgram(records.programs)!;
    const end = addDays(program.effectiveFrom, program.cycleWeeks! * 7);
    expect(cycleState(program, [], addDays(end, -1))?.ended).toBe(false);
    expect(cycleState(program, [], end)).toMatchObject({ ended: true, week: program.cycleWeeks! + 1 });
    const answered = decide('cycle_review', { to: 'continue', today: end });
    expect(cycleState(program, [answered], addDays(end, 1))).toMatchObject({ start: end, week: 1, ended: false });
    const evo = cycleEvolution(program.params!, ['bench_press', 'not_in_program']);
    expect(evo.rotated).toEqual(evo.changes.length > 0 ? ['bench_press'] : []);
    for (const c of evo.changes) expect(c.from).not.toBe(c.to);
    if (evo.changes.length > 0) {
      const applied = decide(
        'cycle_review',
        { from: evo.rotated.join(','), to: 'evolve', today: end },
        { kind: 'durable' },
      );
      expect(durableTraining(SNAP.training, [applied]).rotatedExerciseIds).toEqual(['bench_press']);
      expect(versionDecisions([applied]).cycle).toBe(applied.id);
    }
  });
});
