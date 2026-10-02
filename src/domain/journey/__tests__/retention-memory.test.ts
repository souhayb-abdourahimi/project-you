import { readFileSync } from 'fs';
import { join } from 'path';

import { addDays } from '../../shared/dates';
import { DATA_BY_REASON, explainItem, explainMissedSession, explainPlanChange } from '../explain';
import { journeyMemory, type MemoryInput } from '../memory';
import { retentionRisk, type RetentionInput } from '../retention';

const TODAY = '2026-09-30'; // Wednesday

function risk(patch: Partial<RetentionInput> = {}) {
  return retentionRisk({
    today: TODAY,
    startedOn: '2026-08-03',
    plannedSessionDates: [],
    completedDates: [],
    sessionOutcomes: {},
    lastActivityBeforeToday: addDays(TODAY, -1),
    dayLogs: [],
    weeklyCheckins: [
      { weekStart: '2026-09-14', weekRating: 4, answeredAt: '2026-09-20T18:00:00.000Z' },
      { weekStart: '2026-09-21', weekRating: 4, answeredAt: '2026-09-27T18:00:00.000Z' },
    ],
    recentRpe: null,
    plateau: false,
    ignoredInARow: 0,
    ...patch,
  });
}

describe('retention risk', () => {
  it('nothing wrong: no risk', () => {
    expect(risk()).toEqual({ score: 0, level: 'none', signals: [] });
  });

  it('two missed sessions; replaced and short ones are not missed', () => {
    const planned = ['2026-09-24', '2026-09-26', '2026-09-28'];
    expect(risk({ plannedSessionDates: planned }).signals).toEqual(['missed_sessions']);
    expect(
      risk({
        plannedSessionDates: planned,
        completedDates: ['2026-09-24'],
        sessionOutcomes: { '2026-09-26#0': { status: 'replaced', replacedBy: 'walk', at: '' } },
      }).signals,
    ).toEqual([]);
  });

  it('absence weighs more after 7 days; absence + missed sessions reaches "act"', () => {
    expect(risk({ lastActivityBeforeToday: addDays(TODAY, -3) })).toMatchObject({ score: 30, level: 'watch' });
    const long = risk({
      lastActivityBeforeToday: addDays(TODAY, -8),
      plannedSessionDates: ['2026-09-24', '2026-09-26'],
    });
    expect(long).toMatchObject({ score: 70, level: 'act' });
  });

  it('declared low motivation, fatigue, plateau, skipped check-ins and ignored notifications', () => {
    const r = risk({
      dayLogs: [
        { date: '2026-09-28', motivation: 2, fatigue: 4 },
        { date: '2026-09-29', motivation: 1, fatigue: 4 },
        { date: '2026-09-30', fatigue: 5 },
      ],
      plateau: true,
      weeklyCheckins: [],
      ignoredInARow: 5,
    });
    expect(r.signals).toEqual([
      'low_motivation',
      'high_fatigue',
      'plateau',
      'checkin_skipped',
      'notifications_ignored',
    ]);
  });

  it('a check-in still open (until Tuesday) is not counted as skipped', () => {
    const r = risk({
      today: '2026-09-29',
      weeklyCheckins: [{ weekStart: '2026-09-14', weekRating: 4, answeredAt: '2026-09-20T18:00:00.000Z' }],
    });
    expect(r.signals).not.toContain('checkin_skipped');
  });
});

describe('journey memory', () => {
  const base: MemoryInput = {
    completedDates: [],
    weighInDates: [],
    swapReasons: {},
    meals: [],
    milestones: {},
    adjustments: [],
    confirmed: { refusedExerciseIds: [], dislikedRecipeIds: [], likedRecipeIds: [] },
  };

  it('suggests dropping an exercise only after two "je n’aime pas / je ne peux pas" on different sessions', () => {
    const once = journeyMemory({ ...base, swapReasons: { '2026-09-21#0': { lunge: 'dislike' } } });
    expect(once.suggestions).toEqual([]);
    const twice = journeyMemory({
      ...base,
      swapReasons: {
        '2026-09-21#0': { lunge: 'dislike' },
        '2026-09-28#0': { lunge: 'cant_do' },
        '2026-09-29#0': { row: 'no_equipment' },
      },
    });
    expect(twice.suggestions).toEqual([
      {
        kind: 'drop_exercise',
        exerciseId: 'lunge',
        count: 2,
        sources: [
          { kind: 'session', ref: '2026-09-21#0' },
          { kind: 'session', ref: '2026-09-28#0' },
        ],
      },
    ]);
    // Already confirmed: never suggested again.
    expect(
      journeyMemory({
        ...base,
        swapReasons: { a: { lunge: 'dislike' }, b: { lunge: 'dislike' } },
        confirmed: { ...base.confirmed, refusedExerciseIds: ['lunge'] },
      }).suggestions,
    ).toEqual([]);

    // D-031 D: a stated preference is observed and asked about, a movement that bothers is not a taste.
    expect(
      journeyMemory({ ...base, swapReasons: { a: { lunge: 'preference' }, b: { lunge: 'preference' } } }).suggestions,
    ).toEqual([expect.objectContaining({ kind: 'drop_exercise', exerciseId: 'lunge', count: 2 })]);
    expect(
      journeyMemory({
        ...base,
        swapReasons: { a: { lunge: 'discomfort' }, b: { lunge: 'busy_equipment' }, c: { lunge: 'too_hard_today' } },
      }).suggestions,
    ).toEqual([]);
  });

  it('recipes: "envie d’autre chose" twice → dislike suggestion; eaten 3 times → like suggestion; no reason → nothing guessed', () => {
    const meal = (id: string, recipeId: string, status: string, reason?: 'wanted_else') => ({
      id,
      date: '2026-09-20',
      recipeId,
      status,
      reason,
    });
    const m = journeyMemory({
      ...base,
      meals: [
        meal('1', 'curry', 'skipped', 'wanted_else'),
        meal('2', 'curry', 'replaced', 'wanted_else'),
        meal('3', 'salad', 'skipped'),
        meal('4', 'salad', 'skipped'),
        meal('5', 'oats', 'eaten'),
        meal('6', 'oats', 'eaten'),
        meal('7', 'oats', 'eaten'),
      ],
    });
    expect(m.suggestions.map((s) => `${s.kind}:${'recipeId' in s ? s.recipeId : ''}`)).toEqual([
      'dislike_recipe:curry',
      'like_recipe:oats',
    ]);
  });

  it('facts: usual training day from at least 3 sessions; nothing stored that is sensitive', () => {
    const m = journeyMemory({ ...base, completedDates: ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-24'] });
    expect(m.facts).toEqual([expect.objectContaining({ kind: 'usual_training_day', weekday: 1, count: 3 })]);
    expect(JSON.stringify(m)).not.toMatch(/pain|douleur|fatigue|motivation/);
  });
});

describe('explain', () => {
  it('every reason the Daily Coach can emit has an explanation', () => {
    const source = readFileSync(join(__dirname, '..', 'daily-plan.ts'), 'utf8');
    const reasons = [...source.matchAll(/'((?:workout|activity|recovery|meal|checkin|weigh_in)\.[a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(reasons.length).toBeGreaterThan(10);
    for (const reason of reasons) expect(DATA_BY_REASON[reason]).toBeDefined();
    expect(
      explainItem({ id: 'safety', kind: 'safety', status: 'todo', params: {}, reason: 'safety' }).dataUsed,
    ).toEqual(['data.safety']);
  });

  it('"Pourquoi mon plan a changé ?" answers from the adjustments journal', () => {
    expect(explainPlanChange([])).toBeNull();
    const e = explainPlanChange([
      {
        id: 'a',
        kind: 'nutrition',
        changeKey: 'calories_per_day',
        from: 0,
        to: -120,
        reasonKey: 'adaptation.reason.too_slow_loss',
        evidence: { weeks: 3, adherencePct: 90 },
        status: 'applied',
        effectiveFrom: '2026-09-28',
        decidedAt: '2026-09-27T10:00:00.000Z',
      },
    ]);
    expect(e).toEqual({
      key: 'adaptation.reason.too_slow_loss',
      params: { weeks: 3, adherencePct: 90, from: 0, to: -120, status: 'applied', effectiveFrom: '2026-09-28' },
      dataUsed: ['data.evidence.weeks', 'data.evidence.adherencePct'],
    });
  });

  it('a missed session is never a catch-up', () => {
    const plan = { items: [], adaptations: [], mode: 'normal' } as unknown as Parameters<
      typeof explainMissedSession
    >[0];
    expect(explainMissedSession(plan)).toEqual({ key: 'explain.missed.next', params: {}, dataUsed: ['data.schedule'] });
  });
});
