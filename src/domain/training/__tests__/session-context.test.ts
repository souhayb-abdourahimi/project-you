import type { Adjustment } from '../../journey/adjustments';
import { exerciseTrends, personalRecords } from '../../journey/progress-facts';
import { sessionKey } from '../../shared/ids';
import { exerciseHistory } from '../history';
import { downwardTrend, readExposure, stagnation, type LoggedSet } from '../progression';
import type { PrescribedSession } from '../program';
import { SESSION_CONTEXT, sessionContext, sessionContexts } from '../session-context';

/**
 * W-7.1: one matrix says what a session may tell about the level. A session made lighter on
 * purpose never reads as a plateau, a decline, a lower trend, or the reference of a record.
 */

const decision = (changeKey: string, to: string | number | null = null): Adjustment =>
  ({
    id: `adj-${changeKey}-${String(to)}`,
    changeKey,
    to,
    kind: 'training',
    status: 'applied',
    effectiveFrom: '2026-09-01',
  }) as unknown as Adjustment;
const RESTART = decision('restart');
const REDUCED = decision('reduce_volume', -1);
const CYCLE_LIGHT = decision('cycle_review', 'light_week');
const CYCLE_GO_ON = decision('cycle_review', 'continue');
const EASIER = decision('easier_variant', 'knee_push_up');

describe('the matrix', () => {
  it('maps the variant done and the structure followed to one context', () => {
    expect(sessionContext({ variant: 'full' })).toBe('full');
    expect(sessionContext({ variant: 'off_plan' })).toBe('off_plan');
    expect(sessionContext({ variant: 'short' })).toBe('short');
    expect(sessionContext({ variant: 'light' })).toBe('light');
    expect(sessionContext({ variant: 'full', structure: RESTART })).toBe('restart');
    expect(sessionContext({ variant: 'full', structure: REDUCED })).toBe('reduced');
    // An end-of-cycle light week is a light week; "continue" changes nothing.
    expect(sessionContext({ variant: 'full', structure: CYCLE_LIGHT })).toBe('light');
    expect(sessionContext({ variant: 'full', structure: CYCLE_GO_ON })).toBe('full');
    // The easier variant is its own exercise: read as a normal session in its own history.
    expect(sessionContext({ variant: 'full', structure: EASIER })).toBe('full');
    // The lighter reading wins.
    expect(sessionContext({ variant: 'light', structure: REDUCED })).toBe('light');
    expect(sessionContext({ variant: 'short', structure: RESTART })).toBe('restart');
  });

  it('a lighter context never reads the level; light and restart never set a record reference', () => {
    expect(SESSION_CONTEXT.full).toEqual({ level: 'yes', records: true });
    for (const c of ['reduced', 'light', 'restart'] as const) expect(SESSION_CONTEXT[c].level).toBe('no');
    expect(SESSION_CONTEXT.light.records).toBe(false);
    expect(SESSION_CONTEXT.restart.records).toBe(false);
    expect(SESSION_CONTEXT.short.level).toBe('if_top');
  });
});

/** Bench press, 3 × 8-12, prescribed on each date; `under` = the decision the prescription followed. */
function records(dates: { date: string; under?: Adjustment; load: number }[]) {
  const prescriptions: Record<string, PrescribedSession> = {};
  const sessionIds: Record<string, string> = {};
  for (const { date, under, load } of dates) {
    const id = `p-${date}`;
    sessionIds[sessionKey(date, 0)] = id;
    prescriptions[id] = {
      id,
      date,
      sessionIndex: 0,
      adjustmentId: under?.id ?? null,
      exercises: [{ variant: 'full', exerciseId: 'bench_press', sets: 3, repsMin: 8, repsMax: 12, targetLoadKg: load }],
    } as unknown as PrescribedSession;
  }
  return { prescriptions, sessionIds };
}
const sets = (load: number, reps: number): LoggedSet[] => [reps, reps, reps].map((r) => ({ reps: r, loadKg: load }));

describe('a restart is never a plateau or a decline (progression, PERFORMANCE_DOWN)', () => {
  // Two full sessions at 70 kg, then a restart decided: lower loads on purpose, a bit lower each time.
  const plan = [
    { date: '2026-09-01', load: 70 },
    { date: '2026-09-04', load: 70 },
    { date: '2026-09-08', load: 60, under: RESTART },
    { date: '2026-09-11', load: 55, under: RESTART },
    { date: '2026-09-15', load: 50, under: RESTART },
    { date: '2026-09-25', load: 50, under: RESTART },
  ];
  const facts = {
    setLogs: Object.fromEntries(plan.map((p) => [sessionKey(p.date, 0), { bench_press: sets(p.load, 8) }])),
    completedSessions: plan.map((p) => ({ date: p.date, sessionIndex: 0, variant: 'full' as const })),
    adjustments: [RESTART],
  };
  const history = exerciseHistory({
    exerciseId: 'bench_press',
    records: records(plan),
    facts,
    before: '2026-09-30',
    today: '2026-09-30',
  });
  const range = { sets: 3, repsMin: 8, repsMax: 12 };
  const readings = history.exposures.map((e) => readExposure(e, range));

  it('the restart sessions are read apart, with their context', () => {
    expect(history.exposures.map((e) => e.context)).toEqual(['full', 'full', ...Array(4).fill('restart')]);
    expect(readings.slice(2).every((r) => r.neutral === 'adapted')).toBe(true);
  });

  it('no downward trend, no plateau from sessions lighter on purpose', () => {
    expect(downwardTrend(readings)).toBe(false);
    expect(stagnation(readings, 1)).toMatchObject({ active: false, notBecause: 'not_enough_data' });
  });

  it('an end-of-cycle light week is a light week for the progression too', () => {
    const light = exerciseHistory({
      exerciseId: 'bench_press',
      records: records(plan.map((p) => (p.under ? { ...p, under: CYCLE_LIGHT } : p))),
      facts: { ...facts, adjustments: [CYCLE_LIGHT] },
      before: '2026-09-30',
      today: '2026-09-30',
    });
    expect(light.exposures.map((e) => readExposure(e, range).neutral).slice(2)).toEqual(Array(4).fill('light'));
  });
});

describe('Progress Journey trends and records read the same matrix', () => {
  // Full at 70 × 8 on 09-01, then sessions under a restart at 50 × 8 from 09-20, then full again.
  const plan = [
    { date: '2026-09-01', load: 70 },
    { date: '2026-09-20', load: 50, under: RESTART },
    { date: '2026-09-23', load: 50, under: RESTART },
  ];
  const data = {
    setLogs: Object.fromEntries(plan.map((p) => [sessionKey(p.date, 0), { bench_press: sets(p.load, 8) }])),
    completedSessions: plan.map((p) => ({ date: p.date, sessionIndex: 0, variant: 'full' as const })),
  };
  const contexts = sessionContexts({ ...data, ...records(plan), adjustments: [RESTART] });

  it('every session has its context, from the stored prescription', () => {
    expect(contexts).toEqual({
      [sessionKey('2026-09-01', 0)]: 'full',
      [sessionKey('2026-09-20', 0)]: 'restart',
      [sessionKey('2026-09-23', 0)]: 'restart',
    });
  });

  it('a restart, a reduced volume or a light week never makes a trend "down"', () => {
    // Without the contexts, the lower loads read as a decline: the case this matrix closes.
    expect(exerciseTrends(data)[0].trend).toBe('down');
    expect(exerciseTrends({ ...data, sessionContexts: contexts })).toEqual([]);
    const reduced = { ...contexts, [sessionKey('2026-09-20', 0)]: 'reduced' as const };
    expect(
      exerciseTrends({ ...data, sessionContexts: { ...reduced, [sessionKey('2026-09-23', 0)]: 'reduced' } }),
    ).toEqual([]);
  });

  it('a lighter session is never the reference of a record, nor a record itself', () => {
    // Restart first, then back to full at the usual load: a return to the usual level is not a record.
    const back = {
      setLogs: {
        [sessionKey('2026-09-20', 0)]: { bench_press: sets(50, 8) },
        [sessionKey('2026-09-23', 0)]: { bench_press: sets(52.5, 8) },
        [sessionKey('2026-09-27', 0)]: { bench_press: sets(70, 8) },
        [sessionKey('2026-09-30', 0)]: { bench_press: sets(70, 9) },
      },
      sessionContexts: {
        [sessionKey('2026-09-20', 0)]: 'restart' as const,
        [sessionKey('2026-09-23', 0)]: 'restart' as const,
        [sessionKey('2026-09-27', 0)]: 'full' as const,
        [sessionKey('2026-09-30', 0)]: 'full' as const,
      },
    };
    expect(personalRecords(back)).toEqual([
      { exerciseId: 'bench_press', date: '2026-09-30', loadKg: 70, reps: 9, kind: 'reps' },
    ]);
    // A reduced-volume session keeps its loads: a heavier set there is a real record.
    const reduced = {
      ...back,
      sessionContexts: { ...back.sessionContexts, [sessionKey('2026-09-30', 0)]: 'reduced' as const },
    };
    expect(personalRecords(reduced)).toEqual([
      { exerciseId: 'bench_press', date: '2026-09-30', loadKg: 70, reps: 9, kind: 'reps' },
    ]);
  });

  it('without contexts, the variant done still decides: a light day is no record reference', () => {
    const setLogs = {
      [sessionKey('2026-09-20', 0)]: { bench_press: sets(50, 8) },
      [sessionKey('2026-09-27', 0)]: { bench_press: sets(70, 8) },
    };
    expect(personalRecords({ setLogs })).toHaveLength(1);
    const completedSessions = [{ date: '2026-09-20', sessionIndex: 0, variant: 'light' as const }];
    expect(personalRecords({ setLogs, completedSessions })).toEqual([]);
  });
});
