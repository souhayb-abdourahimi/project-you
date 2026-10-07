import { addDays } from '../../shared/dates';
import { STRUCTURE, STRUCTURAL_CHANGES } from '../../training/structure';
import { adapt, primaryProposal, undecided, type AdaptationInput, type Recommendation } from '../adaptation';
import type { Adherence } from '../adherence';
import {
  appliedDecisions,
  decisionFor,
  effectiveDecisions,
  overriddenDecisions,
  revertDecision,
  type Adjustment,
} from '../adjustments';
import { explainPlanChange } from '../explain';
import { proposalView } from '../proposal';
import {
  activeAdaptations,
  adaptationEffects,
  allowedAgain,
  keptExercises,
  type StructuralSignals,
} from '../structural';
import { toneIssues } from '../voice/tone';
import en from '../../../i18n/locales/en';
import fr from '../../../i18n/locales/fr';

/** W-5 (D-036, D-037): the structural rules of the Adaptation Engine, scenario by scenario (§33). */

const TODAY = '2026-09-30';
const full = (ratio: number | null): Adherence => ({
  windowDays: 14,
  sessions: { planned: 6, done: 6, adapted: 0, skipped: 0, notLogged: 0, ratio },
  mealLogging: { planned: 28, logged: 28, ratio: 1 },
});

function signals(patch: Partial<StructuralSignals> = {}): StructuralSignals {
  return {
    progression: { stagnating: [], down: [], persistent: [], hard: [], struggling: [] },
    patterns: [],
    incomplete: { incomplete: 0, of: 3 },
    lastBreak: { lastDate: addDays(TODAY, -2), days: 2, sessionsBefore: 12 },
    plannedAhead: true,
    recent14: { full: 4, other: 0 },
    cycle: { start: '2026-09-01', week: 5, weeks: 6, ended: false },
    inProgram: ['back_squat', 'bench_press', 'pull_up', 'plank'],
    easierFor: (id) =>
      ({ back_squat: 'goblet_squat', bench_press: 'db_bench_press', pull_up: 'lat_pulldown' })[id] ?? null,
    replacementFor: (id) => ({ bench_press: 'db_bench_press', pull_up: 'lat_pulldown' })[id] ?? null,
    evolution: null,
    cycleFacts: {},
    ...patch,
  };
}

function input(patch: Partial<AdaptationInput> = {}, s: Partial<StructuralSignals> = {}): AdaptationInput {
  return {
    today: TODAY,
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
    adjustments: [],
    progression: { stagnating: [], down: [], persistent: [] },
    structural: signals(s),
    ...patch,
  };
}

const structural = (r: Recommendation[]) =>
  r.filter((x) => x.mode === 'proposed' && x.kind !== 'none').map((x) => x.change.key);

let n = 0;
const answer = (
  r: Recommendation,
  status: 'applied' | 'declined' | 'postponed',
  today = TODAY,
  at = `${today}T09:00:00.000Z`,
): Adjustment =>
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
    status,
    today,
    decidedAt: at,
  });

const tired = (days: number) =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(TODAY, -i), energy: 2, motivation: 3, fatigue: 5 }));

const pattern = (exerciseId: string, category: 'safety' | 'preference' | 'too_hard' | 'temporary', count: number) => ({
  exerciseId,
  category,
  keys: Array.from({ length: count }, (_, i) => `${addDays(TODAY, -2 * (count - i))}#0`),
});

describe('structural proposals: never for one session, always proposed (D-036)', () => {
  it('nothing repeated: nothing structural', () => {
    expect(structural(adapt(input()))).toEqual([]);
  });

  it('every structural recommendation is a proposal with a known scope (or options to choose)', () => {
    const all = [
      ...adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })),
      ...adapt(input({}, { patterns: [pattern('pull_up', 'safety', 2)] })),
      ...adapt(input({}, { cycle: { start: '2026-08-19', week: 7, weeks: 6, ended: true } })),
      ...adapt(input({}, { lastBreak: { lastDate: '2026-09-10', days: 20, sessionsBefore: 6 } })),
    ].filter((r) => r.kind !== 'none');
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const r of all) {
      expect(r.mode).toBe('proposed');
      expect((r.scope !== null && r.scope !== undefined) || (r.options?.length ?? 0) > 0).toBe(true);
    }
  });
});

describe('§33 scenario matrix', () => {
  it('real stagnation (lasting, not hard): advice in order of caution, never nutrition', () => {
    const r = adapt(input({ progression: { stagnating: ['bench_press'], down: [], persistent: ['bench_press'] } }));
    const advice = r.find((x) => x.change.key === 'progression_review');
    expect(advice).toMatchObject({ mode: 'advice', reason: { key: 'adaptation.reason.stagnation_persistent' } });
    expect(r.some((x) => x.kind === 'nutrition')).toBe(false);
  });

  it('lasting plateau that felt very hard: a light week is proposed', () => {
    const r = adapt(
      input(
        { progression: { stagnating: ['bench_press'], down: [], persistent: ['bench_press'] } },
        {
          progression: {
            stagnating: ['bench_press'],
            down: [],
            persistent: ['bench_press'],
            hard: ['bench_press'],
            struggling: [],
          },
        },
      ),
    );
    expect(r.find((x) => x.change.key === 'light_week')).toMatchObject({
      mode: 'proposed',
      reason: { key: 'adaptation.reason.stagnation_hard' },
      scope: { kind: 'week', days: STRUCTURE.lightWeekDays },
    });
    expect(r.some((x) => x.kind === 'nutrition')).toBe(false);
  });

  it('false stagnation from fatigue: rest advice when there was little full training to lighten', () => {
    const r = adapt(input({ dayLogs: tired(3) }, { recent14: { full: 1, other: 3 } }));
    expect(structural(r)).not.toContain('light_week');
    expect(r.find((x) => x.change.key === 'rest_days')).toMatchObject({
      mode: 'advice',
      reason: { key: 'adaptation.reason.fatigue_rest', params: { days: 3 } },
    });
  });

  it('repeated fatigue with real training: a light week, with factual evidence', () => {
    const r = adapt(input({ dayLogs: tired(3) }, { recent14: { full: 4, other: 0 } }));
    expect(r.find((x) => x.change.key === 'light_week')?.evidence).toMatchObject({ fatigueDays: 3, fullSessions: 4 });
  });

  it('performance down on several exercises: a light week, the coach says what was seen', () => {
    const r = adapt(input({ progression: { stagnating: [], down: ['bench_press', 'back_squat'] } }));
    const light = r.find((x) => x.change.key === 'light_week')!;
    expect(light.reason).toEqual({ key: 'adaptation.reason.performance_down', params: { count: 2 } });
    expect(primaryProposal(r)?.id).toBe(light.id);
  });

  it('one exercise down only: no light week (never on one signal)', () => {
    expect(structural(adapt(input({ progression: { stagnating: [], down: ['bench_press'] } })))).toEqual([]);
  });

  describe('light week: accepted, refused, not now', () => {
    const r0 = adapt(input({ progression: { stagnating: [], down: ['bench_press', 'back_squat'] } }));
    const light = r0.find((x) => x.change.key === 'light_week')!;

    it('accepted: in force 7 days, not proposed again meanwhile, then not before the gap', () => {
      const yes = answer(light, 'applied');
      expect(yes).toMatchObject({
        status: 'applied',
        scope: 'week',
        effectiveTo: addDays(TODAY, 6),
        proposalId: light.id,
      });
      expect(allowedAgain([yes], 'light_week', addDays(TODAY, 3))).toBe(false);
      expect(allowedAgain([yes], 'light_week', addDays(TODAY, 6 + STRUCTURE.reapplyGapDays - 1))).toBe(false);
      expect(allowedAgain([yes], 'light_week', addDays(TODAY, 6 + STRUCTURE.reapplyGapDays))).toBe(true);
      expect(activeAdaptations([yes], addDays(TODAY, 2)).map((a) => a.key)).toEqual(['light_week']);
    });

    it('refused: respected, recorded with its context, not proposed for 28 days', () => {
      const no = answer(light, 'declined');
      expect(no).toMatchObject({
        status: 'declined',
        reasonKey: light.reason.key,
        evidence: light.evidence,
        scope: null,
      });
      expect(undecided(r0, [no]).some((x) => x.id === light.id)).toBe(false);
      expect(allowedAgain([no], 'light_week', addDays(TODAY, STRUCTURE.declineCooldownDays - 1))).toBe(false);
      expect(allowedAgain([no], 'light_week', addDays(TODAY, STRUCTURE.declineCooldownDays))).toBe(true);
      const later = adapt(
        input({ today: addDays(TODAY, 7), adjustments: [no], progression: { stagnating: [], down: ['a', 'b'] } }),
      );
      expect(structural(later)).not.toContain('light_week');
    });

    it('not now is not a refusal: back after 7 days if the signal is still there', () => {
      const later = answer(light, 'postponed');
      expect(allowedAgain([later], 'light_week', addDays(TODAY, 6))).toBe(false);
      const again = adapt(
        input({ today: addDays(TODAY, 7), adjustments: [later], progression: { stagnating: [], down: ['a', 'b'] } }),
      );
      expect(structural(again)).toContain('light_week');
    });
  });

  it('reduce_volume: sets missing session after session, a 2-week proposal with its reason', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } }));
    expect(r.find((x) => x.change.key === 'reduce_volume')).toMatchObject({
      mode: 'proposed',
      change: { to: -STRUCTURE.volumeStep },
      scope: { kind: 'weeks', days: STRUCTURE.reduceVolumeDays },
      evidence: { incompleteSessions: 2, sessions: 3, minSets: STRUCTURE.minSets },
    });
    expect(structural(adapt(input({}, { incomplete: { incomplete: 1, of: 3 } })))).toEqual([]);
  });

  it('easier variant: declared too hard twice → the catalogue variant, for 2 sessions', () => {
    const r = adapt(input({}, { patterns: [pattern('back_squat', 'too_hard', 2)] }));
    expect(r.find((x) => x.change.key === 'easier_variant')).toMatchObject({
      change: { from: 'back_squat', to: 'goblet_squat' },
      reason: { key: 'adaptation.reason.easier_declared' },
      scope: { kind: 'sessions', sessions: STRUCTURE.easierSessions, days: STRUCTURE.easierMaxDays },
    });
  });

  it('easier variants are grouped (one proposal, never ten confirmations)', () => {
    const r = adapt(
      input(
        {},
        {
          patterns: [pattern('back_squat', 'too_hard', 2)],
          progression: {
            stagnating: [],
            down: [],
            persistent: [],
            hard: [],
            struggling: [
              { exerciseId: 'bench_press', misses: 3, sessions: 4 },
              { exerciseId: 'pull_up', misses: 3, sessions: 4 },
            ],
          },
        },
      ),
    );
    const easier = r.filter((x) => x.change.key === 'easier_variant');
    expect(easier).toHaveLength(1);
    expect(easier[0].change).toEqual({
      key: 'easier_variant',
      from: 'back_squat,bench_press,pull_up',
      to: 'goblet_squat,db_bench_press,lat_pulldown',
    });
    expect(easier[0].reason.key).toBe('adaptation.reason.easier_group');
  });

  it('no catalogue variant: nothing is invented', () => {
    const r = adapt(input({}, { patterns: [pattern('plank', 'too_hard', 2)], easierFor: () => null }));
    expect(structural(r)).not.toContain('easier_variant');
  });

  it('temporary replacement (busy machine, no time): never a program change', () => {
    const r = adapt(input({}, { patterns: [pattern('bench_press', 'temporary', 6)] }));
    expect(structural(r)).toEqual([]);
  });

  it('confirmed durable replacement: preference twice → a durable proposal with the engine preview', () => {
    const r = adapt(input({}, { patterns: [pattern('bench_press', 'preference', 2)] }));
    const change = r.find((x) => x.change.key === 'exercise_change')!;
    expect(change).toMatchObject({
      change: { from: 'bench_press', to: 'db_bench_press' },
      reason: { key: 'adaptation.reason.exercise_preference', params: { count: 2 } },
      scope: { kind: 'durable' },
      target: 'bench_press',
    });
    // "Le garder": the question comes back only with new occurrences, after the cooldown.
    const keep = answer(change, 'declined');
    const later = addDays(TODAY, STRUCTURE.declineCooldownDays);
    expect(
      structural(
        adapt(input({ today: later, adjustments: [keep] }, { patterns: [pattern('bench_press', 'preference', 2)] })),
      ),
    ).toEqual([]);
  });

  it('repeated discomfort: a question, never a diagnosis; acted on only after confirmation', () => {
    const r = adapt(input({}, { patterns: [pattern('pull_up', 'safety', 2)] }));
    const q = r.find((x) => x.change.key === 'exercise_change')!;
    expect(q.reason.key).toBe('adaptation.reason.exercise_discomfort');
    expect(fr.adaptation.reason.exercise_discomfort).toBe(
      'Cet exercice t’a gêné plusieurs fois. Veux-tu le remplacer dans ton programme ?',
    );
    expect(toneIssues('Tu as une blessure.')).toContain('diagnostic');
    expect(toneIssues(fr.adaptation.reason.exercise_discomfort)).toEqual([]);
    const view = proposalView(q, (id) => id);
    expect(view.confirm).not.toBeNull();
    expect(view.declineLabel.key).toBe('adaptation.keep');
  });

  it('too hard even after an easier variant ended (its sessions done): a durable question', () => {
    const r0 = adapt(input({}, { patterns: [pattern('back_squat', 'too_hard', 2)] }));
    const easier = answer(
      r0.find((x) => x.change.key === 'easier_variant')!,
      'applied',
    );
    const after = addDays(TODAY, 10);
    // Variant still running: no question yet.
    const running = adapt(
      input({ today: after, adjustments: [easier] }, { patterns: [pattern('back_squat', 'too_hard', 4)] }),
    );
    expect(structural(running)).not.toContain('exercise_change');
    const p = {
      exerciseId: 'back_squat',
      category: 'too_hard' as const,
      keys: [`${addDays(after, -4)}#0`, `${addDays(after, -2)}#0`],
    };
    const r = adapt(
      input(
        { today: after, adjustments: [easier] },
        { patterns: [p], doneUnder: { [easier.id]: STRUCTURE.easierSessions } },
      ),
    );
    expect(r.find((x) => x.change.key === 'exercise_change')?.reason.key).toBe('adaptation.reason.exercise_too_hard');
  });

  it('break then restart: proposed before any other training rule, for the sessions to come', () => {
    const r = adapt(
      input(
        { progression: { stagnating: [], down: ['a', 'b'] } },
        { lastBreak: { lastDate: '2026-09-10', days: 20, sessionsBefore: 6 } },
      ),
    );
    expect(structural(r)[0]).toBe('restart');
    expect(structural(r)).not.toContain('light_week');
    expect(r[0]).toMatchObject({
      scope: { kind: 'sessions', sessions: STRUCTURE.restartSessions },
      evidence: { daysSinceLastSession: 20, sessionsBefore: 6 },
    });
    // Nothing planned ahead, or too few sessions before: no restart.
    expect(
      structural(
        adapt(input({}, { lastBreak: { lastDate: '2026-09-10', days: 20, sessionsBefore: 6 }, plannedAhead: false })),
      ),
    ).not.toContain('restart');
    expect(
      structural(adapt(input({}, { lastBreak: { lastDate: '2026-09-10', days: 20, sessionsBefore: 1 } }))),
    ).not.toContain('restart');
  });

  it('end of cycle: a review with options, never a forced light week; the user decides', () => {
    const cycle = { start: '2026-08-19', week: 7, weeks: 6, ended: true };
    const r = adapt(
      input(
        {},
        {
          cycle,
          cycleFacts: { weeks: 6, sessionsDone: 16, sessionsPlanned: 18 },
          evolution: { rotated: ['bench_press'], changes: [{ from: 'bench_press', to: 'db_bench_press' }] },
        },
      ),
    );
    const review = r.find((x) => x.change.key === 'cycle_review')!;
    expect(review.options).toEqual(['continue', 'light_week', 'evolve']);
    expect(structural(r)).not.toContain('light_week');
    const view = proposalView(review, (id) => id);
    expect(view.answers.map((a) => [a.option, a.scope?.kind ?? null])).toEqual([
      ['continue', null],
      ['light_week', 'week'],
      ['evolve', 'durable'],
    ]);
    // Choosing the light week: a week in force, through the same structure as any light week.
    const chosen = decisionFor({
      id: 'c1',
      proposal: { ...review, kind: 'training', scope: review.scope },
      status: 'applied',
      option: 'light_week',
      scope: view.answers[1].scope,
      today: TODAY,
      decidedAt: `${TODAY}T09:00:00Z`,
    });
    expect(chosen).toMatchObject({ to: 'light_week', scope: 'week', effectiveTo: addDays(TODAY, 6) });
    expect(activeAdaptations([chosen], TODAY).map((a) => a.key)).toEqual(['light_week']);
    // Without any change to make, no "evolve" option is offered.
    const plain = adapt(input({}, { cycle }));
    expect(plain.find((x) => x.change.key === 'cycle_review')?.options).toEqual(['continue', 'light_week']);
  });

  it('safety active: no structural proposal, no intensification, the safety message stays', () => {
    const r = adapt(
      input(
        { safety: { active: true, flags: ['low_intake'] }, progression: { stagnating: [], down: ['a', 'b'] } },
        { incomplete: { incomplete: 3, of: 3 }, patterns: [pattern('pull_up', 'safety', 3)] },
      ),
    );
    expect(structural(r).filter((k) => k !== 'calories_per_day')).toEqual([]);
    expect(primaryProposal(r)).toBeNull();
  });

  it('multi-device: A applies offline, B refuses offline; both rows kept, the later gesture wins', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })).find((x) => x.change.key === 'reduce_volume')!;
    const a = answer(r, 'applied', TODAY, `${TODAY}T08:00:00.000Z`);
    const b = answer(r, 'declined', TODAY, `${TODAY}T08:05:00.000Z`);
    for (const journal of [
      [a, b],
      [b, a],
    ]) {
      expect(effectiveDecisions(journal).get(r.id)?.id).toBe(b.id);
      expect(overriddenDecisions(journal).map((x) => x.id)).toEqual([a.id]);
      expect(appliedDecisions(journal)).toEqual([]);
    }
    expect(a.proposalId).toBe(b.proposalId);
  });

  it('offline: answering needs nothing but the journal (pure decision, no network)', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })).find((x) => x.change.key === 'reduce_volume')!;
    const d = answer(r, 'applied');
    expect(undecided([r], [d])).toEqual([]);
    expect(activeAdaptations([d], TODAY).map((x) => x.key)).toEqual(['reduce_volume']);
  });
});

describe('Daily Coach: one structural proposal a day at most (§37)', () => {
  it('picks the first undecided by the engine order', () => {
    const r = adapt(
      input(
        { progression: { stagnating: [], down: ['a', 'b'] } },
        { patterns: [pattern('pull_up', 'safety', 2)], incomplete: { incomplete: 2, of: 3 } },
      ),
    );
    expect(primaryProposal(r)?.change.key).toBe('light_week');
    const decided = answer(primaryProposal(r)!, 'postponed');
    expect(primaryProposal(r, [decided])?.change.key).toBe('exercise_change');
  });
});

describe('revert and history (§21, §31)', () => {
  it('going back is a new decision; the applied one stays in the journal', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })).find((x) => x.change.key === 'reduce_volume')!;
    const yes = answer(r, 'applied');
    const back = revertDecision(yes, {
      id: 'back',
      today: addDays(TODAY, 3),
      decidedAt: `${addDays(TODAY, 3)}T09:00:00Z`,
    });
    expect(yes.status).toBe('applied');
    expect(back).toMatchObject({ status: 'reverted', proposalId: r.id, effectiveFrom: addDays(TODAY, 3) });
    expect(effectiveDecisions([yes, back]).get(r.id)?.id).toBe('back');
    expect(explainPlanChange([back])?.key).toBe('adaptation.explain.reduce_volume');
    expect(allowedAgain([yes, back], 'reduce_volume', addDays(TODAY, 10))).toBe(false);
  });
});

describe('revert with a frozen clock', () => {
  it('a revert taken at the same instant still comes after what it reverts (whatever the ids)', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })).find((x) => x.change.key === 'reduce_volume')!;
    const yes = answer(r, 'applied', TODAY, `${TODAY}T09:00:00.000Z`);
    const back = revertDecision(yes, {
      id: '00000000-0000-4000-8000-000000000000',
      today: TODAY,
      decidedAt: yes.decidedAt,
    });
    expect(back.revision).toBe((yes.revision ?? 0) + 1);
    expect(effectiveDecisions([back, yes]).get(r.id)?.status).toBe('reverted');
  });
});

describe('effect: facts before / after, never a cause (§22–23)', () => {
  it('compares the same number of days before and since', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })).find((x) => x.change.key === 'reduce_volume')!;
    const yes = answer(r, 'applied', '2026-09-16');
    const [effect] = adaptationEffects({
      decisions: [yes],
      today: TODAY,
      plannedDates: [
        '2026-09-03',
        '2026-09-07',
        '2026-09-10',
        '2026-09-14',
        '2026-09-17',
        '2026-09-21',
        '2026-09-24',
        '2026-09-28',
      ],
      doneDates: ['2026-09-03', '2026-09-17', '2026-09-21', '2026-09-24', '2026-09-28'],
      fatigueDates: ['2026-09-05', '2026-09-08'],
    });
    expect(effect.period).toEqual({ from: '2026-09-16', to: '2026-09-29', days: 14, running: false });
    expect(effect.before).toEqual({ planned: 4, done: 1, fatigueDays: 2 });
    expect(effect.after).toEqual({ planned: 4, done: 4, fatigueDays: 0 });
    expect(effect.observations).toEqual(['sessions_more_complete', 'fatigue_lower']);
    expect(effect.cause.reasonKey).toBe('adaptation.reason.reduce_volume');
  });
});

describe('memory: "le garder" is a synced decision (§24–25)', () => {
  it('counts the preference sessions up to the answer; temporary reasons never count', () => {
    const keep = decisionFor({
      id: 'k',
      proposal: {
        id: 'training:exercise_change.bench_press:2026-09-28',
        kind: 'training',
        change: { key: 'exercise_change', from: 'bench_press' },
        reason: { key: 'adaptation.reason.exercise_preference' },
        evidence: {},
      },
      status: 'declined',
      today: TODAY,
      decidedAt: `${TODAY}T09:00:00Z`,
    });
    const swaps = {
      '2026-09-20#0': { bench_press: 'preference' },
      '2026-09-22#0': { bench_press: 'busy_equipment' },
      '2026-09-24#0': { bench_press: 'dislike' },
      '2026-10-02#0': { bench_press: 'dislike' },
    };
    expect(keptExercises([keep], swaps)).toEqual({ bench_press: 2 });
    expect(keptExercises([], swaps, { squat: 3 })).toEqual({ squat: 3 });
  });
});

describe('proposal wording: what, why, how long, what it does (§18, §27)', () => {
  it('every structural proposal has a duration and an impact, and its facts for "Pourquoi ?"', () => {
    const r = adapt(input({}, { incomplete: { incomplete: 2, of: 3 } })).find((x) => x.change.key === 'reduce_volume')!;
    const v = proposalView(r, (id) => id);
    expect(v.duration).toEqual({ key: 'adaptation.duration.weeks', params: { weeks: 2 } });
    expect(v.impact?.key).toBe('adaptation.impact.reduce_volume');
    expect(v.why.map((w) => w.key)).toEqual([
      'adaptation.evidence.incompleteSessions',
      'adaptation.evidence.sessions',
      'adaptation.evidence.minSets',
    ]);
    expect(v.answers).toEqual([
      { option: null, label: { key: 'adaptation.applyLabel.reduce_volume', params: {} }, scope: r.scope },
    ]);
  });

  it('every structural change has its impact and a precise apply label in FR and EN (W-7 §50)', () => {
    const tree = (locale: { adaptation: object }) =>
      locale.adaptation as unknown as Record<string, Record<string, string>>;
    for (const locale of [fr, en]) {
      for (const key of STRUCTURAL_CHANGES) {
        expect([key, typeof tree(locale).impact[key]]).toEqual([key, 'string']);
        if (key !== 'cycle_review') expect([key, typeof tree(locale).applyLabel[key]]).toEqual([key, 'string']);
      }
    }
    const frequency = proposalView(
      {
        id: 'training:sessions_per_week:2026-09-28',
        kind: 'training',
        change: { key: 'sessions_per_week', from: 3, to: 2 },
        reason: { key: 'adaptation.reason.missed_sessions', params: {} },
        evidence: {},
        mode: 'proposed',
        scope: { kind: 'durable' },
      },
      (id) => id,
    );
    expect(frequency.answers[0].label).toEqual({ key: 'adaptation.applyLabel.sessions_per_week', params: { to: 2 } });
  });
});
