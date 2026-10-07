import { addDays } from '../../shared/dates';
import type { PlannedExercise } from '../../training/program';
import { coachCase, restDay } from '../__fixtures__/coach';
import { adapt, primaryProposal, type AdaptationInput } from '../adaptation';
import type { Adherence } from '../adherence';
import { decisionFor, type Adjustment } from '../adjustments';
import { progressionHighlight } from '../coach';
import { activeAdaptations, adaptationEffects, type StructuralSignals } from '../structural';

/**
 * W-7 §48: the coach over several weeks, with the real Adaptation Engine underneath. Each step is
 * one day: what the engines decide from the facts, then what the coach of the day says.
 */

const full = (ratio: number | null): Adherence => ({
  windowDays: 14,
  sessions: { planned: 6, done: 6, adapted: 0, skipped: 0, notLogged: 0, ratio, unknownDays: 0 },
  mealLogging: { planned: 28, logged: 28, ratio: 1 },
});

function signals(today: string, patch: Partial<StructuralSignals> = {}): StructuralSignals {
  return {
    progression: { stagnating: [], down: [], persistent: [], hard: [], struggling: [] },
    patterns: [],
    incomplete: { incomplete: 0, of: 3 },
    lastBreak: { lastDate: addDays(today, -2), days: 2, sessionsBefore: 12 },
    plannedAhead: true,
    recent14: { full: 4, other: 0 },
    cycle: { start: addDays(today, -20), week: 3, weeks: 6, ended: false },
    inProgram: ['back_squat', 'bench_press', 'pull_up', 'plank'],
    easierFor: () => null,
    replacementFor: (id) => ({ bench_press: 'db_bench_press', pull_up: 'lat_pulldown' })[id] ?? null,
    evolution: null,
    cycleFacts: {},
    ...patch,
  };
}

function engine(
  today: string,
  adjustments: Adjustment[],
  patch: Partial<AdaptationInput> = {},
  s: Partial<StructuralSignals> = {},
) {
  const input: AdaptationInput = {
    today,
    startedOn: '2026-07-01',
    goal: 'muscle_gain',
    safety: { active: false, flags: [] },
    adherence14: full(1),
    adherence28: full(1),
    missedPerWeek: [0, 0],
    weights: [],
    waist: [],
    trends: [],
    setLogs: {},
    dayLogs: [],
    rescheduled: {},
    spending: null,
    targets: { calories: 2600, floorKcal: 1700, maintenance: 2500 },
    calorieOffset: 0,
    sessionsPerWeek: { profile: 3, current: 3 },
    adjustments,
    progression: { stagnating: [], down: [], persistent: [] },
    structural: signals(today, s),
    ...patch,
  };
  return primaryProposal(adapt(input), adjustments);
}

let n = 0;
const accept = (r: NonNullable<ReturnType<typeof engine>>, today: string): Adjustment =>
  decisionFor({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    proposal: {
      id: r.id,
      kind: r.kind as 'training',
      change: r.change,
      reason: r.reason,
      evidence: r.evidence,
      scope: r.scope,
    },
    status: 'applied',
    today,
    decidedAt: `${today}T09:00:00.000Z`,
  });

const tired = (today: string, days: number) =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(today, -i), energy: 2, motivation: 3, fatigue: 5 }));

describe('scenario 1: normal → fatigue → light week proposed → accepted → effect → normal', () => {
  it('runs over four weeks without contradiction', () => {
    // Week 1, Monday: nothing to adjust.
    const d0 = '2026-09-14';
    expect(engine(d0, [])).toBeNull();
    expect(coachCase({ today: d0 })).toMatchObject({ priority: 'session', calm: true });

    // Week 2: three tired days with real training → the engine proposes a light week; it leads.
    const d1 = '2026-09-23';
    const proposal = engine(d1, [], { dayLogs: tired(d1, 3) })!;
    expect(proposal.change.key).toBe('light_week');
    const day1 = coachCase({ today: d1, state: { fatigue: 'high' }, coach: { proposal, celebration: 'first_month' } });
    expect(day1.priority).toBe('structural');
    expect(day1.celebration).toBeNull();

    // Accepted: the next day it is in force, said in one line on the session day, never proposed again.
    const yes = accept(proposal, d1);
    const d2 = addDays(d1, 1);
    expect(engine(d2, [yes], { dayLogs: tired(d2, 3) })?.change.key).not.toBe('light_week');
    const active = activeAdaptations([yes], d2);
    const day2 = coachCase({ today: d2, day: { lightWeek: true }, coach: { active } });
    expect(day2.supportingFacts.map((f) => f.key)).toContain('coachDay.active.light_week');

    // After the week: what was observed, once, without a cause.
    const d3 = addDays(d1, 9);
    const effects = adaptationEffects({
      decisions: [yes],
      today: d3,
      plannedDates: ['2026-09-15', '2026-09-17', '2026-09-19', '2026-09-24', '2026-09-26', '2026-09-28'],
      doneDates: ['2026-09-15', '2026-09-24', '2026-09-26', '2026-09-28'],
      checkinDates: ['2026-09-21', '2026-09-22', '2026-09-23'],
      fatigueDates: ['2026-09-21', '2026-09-22', '2026-09-23'],
    });
    const day3 = coachCase({ today: d3, coach: { effects } });
    expect(day3.supportingFacts.map((f) => f.key)).toContain('coachDay.followup.more_complete');
    const day4 = coachCase({
      today: addDays(d3, 1),
      coach: { effects, shown: day3.shownIds.map((id) => ({ id, date: d3 })) },
    });
    expect(day4.supportingFacts.map((f) => f.key).filter((k) => k.startsWith('coachDay.followup'))).toEqual([]);

    // Back to normal.
    expect(day4).toMatchObject({ priority: 'session', calm: true });
  });
});

describe('scenario 2: discomfort → one-off swap → repeat → question → durable replacement → no re-ask', () => {
  it('asks once, acts only on confirmation, then stays quiet', () => {
    const d0 = '2026-09-21';
    const once = { exerciseId: 'pull_up', category: 'safety' as const, keys: [`${addDays(d0, -2)}#0`] };
    // One discomfort: a one-off swap during the session, nothing structural, nothing asked.
    expect(engine(d0, [], {}, { patterns: [once] })).toBeNull();
    expect(coachCase({ today: d0 }).priority).toBe('session');

    // Twice: the engine asks (never a diagnosis); the coach puts the question first.
    const d1 = addDays(d0, 4);
    const twice = { ...once, keys: [`${addDays(d1, -6)}#0`, `${addDays(d1, -2)}#0`] };
    const q = engine(d1, [], {}, { patterns: [twice] })!;
    expect(q).toMatchObject({ change: { key: 'exercise_change', from: 'pull_up', to: 'lat_pulldown' } });
    expect(coachCase({ today: d1, coach: { proposal: q } }).primary).toMatchObject({ kind: 'proposal' });

    // Confirmed: a durable replacement (a new program version, W-5); never asked again.
    const yes = accept(q, d1);
    for (const d of [addDays(d1, 1), addDays(d1, 8), addDays(d1, 30)]) {
      expect(engine(d, [yes], {}, { patterns: [twice] })).toBeNull();
      expect(coachCase({ today: d }).primary).not.toMatchObject({ kind: 'proposal' });
    }
  });
});

describe('scenario 3: three weeks away → return → restart proposed → accepted → progression', () => {
  const row = {
    variant: 'full',
    position: 0,
    exerciseId: 'back_squat',
    targetLoadKg: 82.5,
    progressionAction: 'increase_load',
    progressionReason: 'progression.reason.top_confirmed',
    progressionParams: { max: 10, sessions: 2, increment: 2.5 },
  } as unknown as PlannedExercise;

  it('welcomes back without a list of what was not done, then progresses from the real sessions', () => {
    const back = '2026-10-12';
    const absent = ['2026-09-21', '2026-09-23', '2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07'];
    const restart = engine(back, [], {}, { lastBreak: { lastDate: '2026-09-19', days: 23, sessionsBefore: 10 } })!;
    expect(restart.change.key).toBe('restart');

    // Return day: the comeback leads with the gentle restart; no question piled on top, no record.
    const day = coachCase({
      today: back,
      state: { comeback: true },
      coach: { proposal: restart, celebration: 'first_month' },
      facts: { plannedDates: absent },
    });
    expect(day).toMatchObject({
      priority: 'comeback',
      primary: { kind: 'proposal', changeKey: 'restart' },
      question: null,
      celebration: null,
      why: true,
    });
    expect(day.deferred).toEqual(expect.arrayContaining(['question', 'celebration']));

    // Accepted: the restart is in force on the next session days; nothing increases meanwhile.
    const yes = accept(restart, back);
    const next = addDays(back, 2);
    const active = activeAdaptations([yes], next);
    expect(active.map((a) => a.key)).toEqual(['restart']);
    const during = coachCase({ today: next, coach: { active } });
    expect(during.supportingFacts.map((f) => f.key)).toContain('coachDay.active.restart');

    // Restart over (its sessions done): the stored W-4 increase is said, from the prescription.
    const later = addDays(back, 10);
    const after = coachCase({
      today: later,
      coach: {
        active: activeAdaptations([yes], later, { [yes.id]: 2 }),
        progression: progressionHighlight([{ when: 'today', date: later, exercises: [row] }]),
      },
    });
    expect(after.supportingFacts[0]).toEqual({
      key: 'coachDay.progression',
      params: { exercise: 'back_squat', load: 82.5 },
    });
    // A rest day in between stays a rest day.
    expect(coachCase({ today: addDays(back, 1), day: { day: restDay(addDays(back, 1)) } }).offPlan).toBe(true);
  });
});
