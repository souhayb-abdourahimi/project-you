import { addDays, type IsoDate } from '../../shared/dates';
import { decisionFor, revertDecision, sequenced } from '../adjustments';
import { decisionJournal } from '../training-history';
import { EFFECT_COVERAGE, minCheckinDays } from '../effect-coverage';
import { adaptationEffects } from '../structural';

/**
 * D-041: before / after an adaptation, with the coverage of each window. A missing check-in is
 * never an improvement; an effect observed stays in the history after a revert.
 */

// A light week decided on Monday 2026-09-21 (7 days, to 09-27); today is 09-30.
const FROM = '2026-09-21';
const TODAY = '2026-09-30';
const days = (from: IsoDate, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const BEFORE = days('2026-09-14', 7);
const AFTER = days(FROM, 7);

const light = sequenced(
  decisionFor({
    id: '00000000-0000-4000-8000-0000000000e1',
    proposal: {
      id: `training:light_week:${FROM}`,
      kind: 'training',
      change: { key: 'light_week' },
      reason: { key: 'adaptation.reason.fatigue_rest' },
      evidence: { fatigueDays: 3 },
      scope: { kind: 'week', days: 7 },
    },
    status: 'applied',
    today: FROM,
    decidedAt: `${FROM}T08:00:00.000Z`,
  }),
  [],
);

const planned = [...BEFORE, ...AFTER].filter((_, i) => i % 2 === 0); // 4 + 3 sessions
const effectOf = (patch: Partial<Parameters<typeof adaptationEffects>[0]> = {}) =>
  adaptationEffects({
    decisions: [light],
    today: TODAY,
    plannedDates: planned,
    doneDates: planned,
    checkinDates: [],
    fatigueDates: [],
    ...patch,
  })[0];

describe('the minimum coverage is one value, documented (D-041)', () => {
  it('7-day window: 4 check-in days; 14 days: 7; never fewer than 3', () => {
    expect(minCheckinDays(7)).toBe(4);
    expect(minCheckinDays(14)).toBe(7);
    expect(minCheckinDays(2)).toBe(EFFECT_COVERAGE.minCheckinDays);
  });
});

describe('fatigue before / after with its coverage', () => {
  it('the audit case: 5 check-ins and 3 tired days before, no check-in after → insufficient_data, never "less fatigue"', () => {
    const e = effectOf({
      checkinDates: BEFORE.slice(0, 5),
      fatigueDates: BEFORE.slice(0, 3),
    });
    expect(e.before).toMatchObject({ days: 7, checkinDays: 5, fatigueDays: 3 });
    expect(e.after).toMatchObject({ days: 7, checkinDays: 0, fatigueDays: 0 });
    expect(e.fatigue).toBe('insufficient_data');
    expect(e.observations).not.toContain('fatigue_lower');
    expect(e.observations).toContain('fatigue_insufficient_data');
  });

  it('no check-in at all → insufficient_data (said because the cause was fatigue)', () => {
    const e = effectOf();
    expect(e.fatigue).toBe('insufficient_data');
    expect(e.observations).toContain('fatigue_insufficient_data');
  });

  it('good coverage on both sides → an observed change is possible', () => {
    const e = effectOf({
      checkinDates: [...BEFORE.slice(0, 5), ...AFTER.slice(0, 5)],
      fatigueDates: [...BEFORE.slice(0, 3), AFTER[0]],
    });
    expect(e.fatigue).toBe('lower');
    expect(e.observations).toContain('fatigue_lower');
  });

  it('poor coverage before only, or after only → insufficient_data', () => {
    const before = effectOf({ checkinDates: [...BEFORE.slice(0, 2), ...AFTER.slice(0, 6)], fatigueDates: [AFTER[1]] });
    expect(before.fatigue).toBe('insufficient_data');
    const after = effectOf({ checkinDates: [...BEFORE, ...AFTER.slice(0, 3)], fatigueDates: [BEFORE[0], BEFORE[1]] });
    expect(after.fatigue).toBe('insufficient_data');
  });

  it('the same rate with fewer check-ins is "same", not "lower"', () => {
    const e = effectOf({
      checkinDates: [...BEFORE.slice(0, 6), ...AFTER.slice(0, 4)],
      fatigueDates: [...BEFORE.slice(0, 3), ...AFTER.slice(0, 2)],
    });
    expect(e.fatigue).toBe('same');
  });
});

describe('completion with its coverage', () => {
  it('too few planned sessions on one side → insufficient_data', () => {
    const e = effectOf({ plannedDates: [BEFORE[0], BEFORE[2], AFTER[0]], doneDates: [AFTER[0]] });
    expect(e.completion).toBe('insufficient_data');
    expect(e.observations).toContain('sessions_insufficient_data');
    expect(e.observations).not.toContain('sessions_more_complete');
  });

  it('same logical periods: complete days only, the same number on each side', () => {
    // While the change runs, today is not counted (the day is not over).
    const running = adaptationEffects({
      decisions: [light],
      today: addDays(FROM, 3),
      plannedDates: planned,
      doneDates: planned,
      checkinDates: [],
      fatigueDates: [],
    })[0];
    expect(running.period).toMatchObject({ from: FROM, to: addDays(FROM, 2), days: 3, running: true });
    expect(running.before.days).toBe(3);
    // Decided today: nothing to compare yet.
    const fresh = adaptationEffects({
      decisions: [light],
      today: FROM,
      plannedDates: planned,
      doneDates: planned,
      checkinDates: [],
      fatigueDates: [],
    })[0];
    expect([fresh.after.days, fresh.completion, fresh.fatigue]).toEqual([0, 'insufficient_data', 'insufficient_data']);
  });
});

describe('a revert after the observation: the effect stays in the history', () => {
  it('the window ends the day before the revert; the journal still shows what was observed', () => {
    const back = sequenced(
      revertDecision(light, {
        id: '00000000-0000-4000-8000-0000000000e2',
        today: '2026-09-25',
        decidedAt: '2026-09-25T08:00:00Z',
      }),
      [light],
    );
    const effects = adaptationEffects({
      decisions: [light, back],
      today: TODAY,
      plannedDates: planned,
      doneDates: planned,
      checkinDates: [...BEFORE.slice(2), ...AFTER.slice(0, 4)],
      fatigueDates: [...BEFORE.slice(2, 5), AFTER[0]],
    });
    expect(effects).toHaveLength(1);
    const [e] = effects;
    expect(e.period).toEqual({ from: FROM, to: '2026-09-24', days: 4, running: false, endedBy: 'answer' });
    expect(e.before.days).toBe(4);
    expect(e.fatigue).toBe('lower');
    const journal = decisionJournal([light, back], effects);
    const applied = journal.find((x) => x.decision.id === light.id)!;
    expect(applied.effect?.observations).toContain('fatigue_lower');
    expect(applied.inForce).toBe(false);
  });
});
