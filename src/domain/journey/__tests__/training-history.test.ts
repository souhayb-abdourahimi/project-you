import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import { addDays } from '../../shared/dates';
import { sessionKey } from '../../shared/ids';
import type { CompareFacts } from '../../training/compare';
import { prescriptionFor } from '../../training/week';
import { decisionFor, revertDecision } from '../adjustments';
import { explainDecision, explainExercise, explainLoad, explainPlanChange, explainVersion } from '../explain';
import type { AdaptationEffect } from '../structural';
import { decisionJournal, isTrainingDecision, trainingHistory } from '../training-history';
import { translator } from '../__fixtures__/journey';
import { toneIssues } from '../voice/tone';

/** W-6 (D-038): history and "Pourquoi ?" answers are read from what was stored, never recomputed. */

const SNAP = SCENARIOS.muscleGain;
const WEEK = '2026-09-28';
const SEED = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-28T07:00:00.000Z';
const MONDAY = sessionKey(WEEK, 0);
const R = publishWeek(SNAP, { today: WEEK, weekStart: WEEK, seed: SEED, at: AT });

let n = 0;
const decide = (key: string, status: 'applied' | 'declined' | 'postponed', day: string, to: number | string = 1) =>
  decisionFor({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    proposal: {
      id: `training:${key}:${WEEK}`,
      kind: key === 'calories_per_day' ? 'nutrition' : 'training',
      change: { key, to },
      reason: { key: `adaptation.reason.${key}` },
      evidence: { days: 3 },
      scope: key === 'light_week' ? { kind: 'week', days: 7 } : null,
    },
    status,
    today: day,
    decidedAt: `${day}T09:00:00.000Z`,
  });

describe('decisionJournal', () => {
  it('training answers only, newest first, the one in force marked, effects attached', () => {
    const postponed = decide('light_week', 'postponed', '2026-09-21');
    const applied = decide('light_week', 'applied', '2026-09-29');
    const calories = decide('calories_per_day', 'applied', '2026-09-29', 2100);
    const reverted = revertDecision(applied, {
      id: 'rev-1',
      today: '2026-09-30',
      decidedAt: '2026-09-30T08:00:00.000Z',
    });
    const effect = { decisionId: applied.id, observations: ['fatigue_lower'] } as unknown as AdaptationEffect;
    const journal = decisionJournal([postponed, applied, calories, reverted], [effect]);
    expect(journal.map((e) => [e.decision.status, e.inForce])).toEqual([
      ['reverted', true],
      ['applied', false],
      ['postponed', false],
    ]);
    expect(journal[1].effect).toBe(effect);
    expect(journal.every((e) => e.change === 'light_week')).toBe(true);
    expect(isTrainingDecision(calories)).toBe(false);
  });

  it('an end-of-cycle light week is a light week', () => {
    const cycle = decide('cycle_review', 'applied', '2026-09-29', 'light_week');
    expect(decisionJournal([cycle])[0].change).toBe('light_week');
  });
});

describe('trainingHistory', () => {
  it('weeks newest first, empty past weeks left out, the current week always there', () => {
    const facts: CompareFacts = {
      setLogs: {},
      completedSessions: [{ date: WEEK, sessionIndex: 0, variant: 'full' }],
    };
    const old = decide('reduce_volume', 'declined', '2026-09-08');
    const weeks = trainingHistory({
      records: R,
      facts,
      adjustments: [old],
      today: '2026-10-06',
      weeks: 6,
    });
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-05', WEEK, '2026-09-07']);
    expect(weeks[1].week).toMatchObject({ planned: 3, done: 1 });
    expect(weeks[1].versions.map((v) => v.version)).toEqual([1]);
    expect(weeks[2].decisions.map((e) => e.decision.id)).toEqual([old.id]);
  });
});

describe('explanations (W-6)', () => {
  const t = translator('fr');
  const row = prescriptionFor(R, MONDAY)!.exercises[0];

  it('"Pourquoi cet exercice ?": the stored purpose, never a generated text', () => {
    const e = explainExercise(row)!;
    expect(e.key).toBe(`workout.why.${row.purpose}`);
    expect(explainExercise({ purpose: null, purposeTarget: null })).toBeNull();
  });

  it('"Pourquoi cette charge ?": the stored decision, its numbers, its confidence; nothing for a replacement', () => {
    const decided = {
      ...row,
      progressionAction: 'increase_load' as const,
      progressionReason: 'progression.reason.top_of_range',
      progressionParams: { sessions: 2, reps: 12 },
      progressionConfidence: 'medium' as const,
    };
    expect(explainLoad(decided)).toEqual({
      key: 'reasons.progression.reason.top_of_range',
      params: { sessions: 2, reps: 12 },
      dataUsed: ['data.sessions'],
      action: 'increase_load',
      confidence: 'medium',
    });
    expect(explainLoad(decided, true)).toBeNull();
    expect(explainLoad({ ...decided, progressionAction: null })).toBeNull();
  });

  it('a version says why it exists; every reason has a sentence in both languages, with no guilt', () => {
    const v = R.programs[0];
    expect(explainVersion(v)).toEqual({
      key: 'program.reason.first',
      params: { version: 1, from: WEEK },
      dataUsed: ['data.training_profile'],
    });
    const en = translator('en');
    for (const r of [
      'first',
      'frequency',
      'adaptation',
      'equipment',
      'goal',
      'level',
      'duration',
      'exercises',
      'cycle',
      'engine',
      'resumed',
      'reconstructed',
    ]) {
      const key = `program.reason.${r}`;
      expect(t(key)).not.toBe(key);
      expect(en(key)).not.toBe(key);
      expect(toneIssues(t(key))).toEqual([]);
    }
  });

  it('explainPlanChange is the latest applied or reverted decision, explained like any other', () => {
    const a = decide('restart', 'applied', '2026-09-29', 2);
    const d = decide('reduce_volume', 'declined', '2026-09-30', -1);
    const why = explainPlanChange([a, d])!;
    expect(why).toEqual(explainDecision(a));
    expect(why.key).toBe('adaptation.explain.restart');
    expect(explainDecision(decide('light_week', 'applied', addDays(WEEK, 1))).key).toBe('adaptation.reason.light_week');
  });
});
