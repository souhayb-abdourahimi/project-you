import { addDays } from '../../shared/dates';
import type { PlannedExercise } from '../../training/program';
import { coachCase, dayInput, proposalOf, rendered, restDay } from '../__fixtures__/coach';
import { CADENCE } from '../coach-memory';
import { coachDay, MAX_SUPPORTING_FACTS, progressionHighlight } from '../coach';
import { buildDailyPlan } from '../daily-plan';
import { toneIssues } from '../voice/tone';
import type { AdaptationEffect } from '../structural';

/** W-7 (D-039): one arbitration of the day, from facts only (§2–4, §30, §49). */

// 2026-09-30 is a Wednesday.
const TODAY = '2026-09-30';
const LOW_INTAKE = { flags: ['low_intake' as const] };
/** Two planned sessions in the last 14 days with nothing recorded. */
const NOT_HAPPENED = { plannedDates: [addDays(TODAY, -6), addDays(TODAY, -3)] };

const effect = (patch: Partial<AdaptationEffect> = {}): AdaptationEffect => ({
  decisionId: 'd1',
  changeKey: 'light_week',
  cause: { reasonKey: 'adaptation.reason.light_week', evidence: {} },
  period: { from: addDays(TODAY, -9), to: addDays(TODAY, -2), days: 7, running: false },
  before: { planned: 3, done: 1, fatigueDays: 3 },
  after: { planned: 3, done: 3, fatigueDays: 1 },
  observations: ['sessions_more_complete', 'fatigue_lower'],
  ...patch,
});

const row = (patch: Partial<PlannedExercise> = {}): PlannedExercise =>
  ({
    id: 'p1',
    variant: 'full',
    position: 0,
    exerciseId: 'bench_press',
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    targetLoadKg: 72.5,
    progressionAction: 'increase_load',
    progressionReason: 'progression.reason.top_confirmed',
    progressionParams: { max: 12, sessions: 2, increment: 2.5 },
    progressionConfidence: 'high',
    ...patch,
  }) as PlannedExercise;
const progression = progressionHighlight([{ when: 'today', date: TODAY, exercises: [row()] }]);

describe('priority order (§2, §49)', () => {
  it('safety wins over everything: no proposal, no celebration, no question, no off plan, no push', () => {
    const c = coachCase({
      today: TODAY,
      day: { day: restDay(TODAY) },
      state: { safety: LOW_INTAKE },
      coach: { proposal: proposalOf('light_week'), celebration: 'first_month', progression },
      facts: NOT_HAPPENED,
    });
    expect(c.priority).toBe('safety');
    expect(c.primary).not.toEqual(expect.objectContaining({ kind: 'proposal' }));
    expect(c).toMatchObject({ celebration: null, question: null, secondary: null, offPlan: false, why: false });
    expect(c.deferred).toEqual(expect.arrayContaining(['proposal', 'celebration', 'question']));
    expect(c.safety).not.toBeNull();
  });

  it('safety + milestone → safety (case D)', () => {
    const c = coachCase({ today: TODAY, state: { safety: LOW_INTAKE }, coach: { celebration: 'first_month' } });
    expect([c.priority, c.celebration]).toEqual(['safety', null]);
  });

  it('comeback before off plan: a comeback day never offers a session off plan', () => {
    const c = coachCase({ today: TODAY, day: { day: restDay(TODAY) }, state: { comeback: true } });
    expect(c.priority).toBe('comeback');
    expect(c.offPlan).toBe(false);
  });

  it('comeback + why → comeback, the why is quoted (case E)', () => {
    const c = coachCase({ today: TODAY, state: { comeback: true } });
    expect(c.priority).toBe('comeback');
    expect(c.why).toBe(true);
  });

  it('comeback: the gentle restart may lead, any other proposal waits', () => {
    const restart = coachCase({ today: TODAY, state: { comeback: true }, coach: { proposal: proposalOf('restart') } });
    expect(restart.primary).toMatchObject({ kind: 'proposal', changeKey: 'restart' });
    const light = coachCase({ today: TODAY, state: { comeback: true }, coach: { proposal: proposalOf('light_week') } });
    expect(light.primary).toMatchObject({ kind: 'item', itemId: 'workout' });
    expect(light.deferred).toContain('proposal');
  });

  it('adaptation + record → the adaptation; the celebration waits (case C)', () => {
    const c = coachCase({ today: TODAY, coach: { proposal: proposalOf('light_week'), celebration: 'first_record' } });
    expect(c.priority).toBe('structural');
    expect(c.primary).toMatchObject({ kind: 'proposal', changeKey: 'light_week' });
    expect(c.celebration).toBeNull();
    expect(c.deferred).toContain('celebration');
    // A proposal leading: no question piled on top, no off plan.
    expect(c.question).toBeNull();
  });

  it('fatigue + progression → fatigue: a lighter session, the increase is not said (case B)', () => {
    const c = coachCase({ today: TODAY, state: { fatigue: 'high' }, coach: { progression } });
    expect(c.priority).toBe('session');
    expect(c.supportingFacts.map((f) => f.key)).not.toContain('coachDay.progression');
    expect(c.deferred).toContain('progression');
  });

  it('session + incomplete nutrition → the session leads, nutrition is the second option (case A)', () => {
    const c = coachCase({
      today: TODAY,
      coach: { nutrition: { dayIncomplete: true, planGap: false, shoppingToday: false, missingIngredients: null } },
    });
    expect(c.priority).toBe('session');
    expect(c.primary).toEqual({ kind: 'item', itemId: 'workout' });
    expect(c.secondary).toMatchObject({ kind: 'route', route: 'nutrition' });
    expect(c.supportingFacts.map((f) => f.key)).toContain('coachDay.nutrition.day_incomplete');
  });

  it('rest day with nothing urgent → light content, the empty day is fine (case F, §46)', () => {
    const c = coachCase({ today: TODAY, day: { day: restDay(TODAY) } });
    expect(c.priority).toBe('light');
    expect(c.calm).toBe(true);
    expect(c.offPlan).toBe(true);
    expect(c.primary).toMatchObject({ kind: 'item', itemId: 'recovery' });
  });

  it('an ordinary session day: « Rien de particulier à ajuster », then the plan', () => {
    const c = coachCase({ today: TODAY });
    expect(c).toMatchObject({
      priority: 'session',
      calm: true,
      why: false,
      primary: { kind: 'item', itemId: 'workout' },
    });
  });

  it('low_logging alone is not safety (D-027): the session leads, the check-in stays an item', () => {
    const input = dayInput(TODAY, {}, { safety: { lowLogging: { since: '2026-09-27', days: 3 } } });
    const daily = buildDailyPlan(input);
    const c = coachCase({ today: TODAY, state: { safety: { lowLogging: { since: '2026-09-27', days: 3 } } } });
    expect(c.priority).toBe('session');
    expect(daily.items.map((i) => i.kind)).toContain('checkin');
  });

  it('a difficult day: today is lighter at once, nothing else piled up (§26)', () => {
    const c = coachCase({ today: TODAY, day: { dayLog: { date: TODAY, mode: 'difficult' } } });
    expect(c.priority).toBe('session');
    expect(c.calm).toBe(false);
    expect(c.offPlan).toBe(false);
    expect(c.why).toBe(true);
    expect(c.supportingFacts[0].key).toMatch(/^daily\.adapt\.difficult_/);
  });

  it('progression is said only from the stored W-4 decision, on a full session', () => {
    const c = coachCase({ today: TODAY, coach: { progression } });
    expect(c.supportingFacts.slice(0, 2)).toEqual([
      { key: 'coachDay.progression', params: { exercise: 'bench_press', load: 72.5 } },
      { key: 'reasons.progression.reason.top_confirmed', params: { max: 12, sessions: 2, increment: 2.5 } },
    ]);
    // No stored increase, no line: nothing is recomputed.
    expect(
      progressionHighlight([{ when: 'today', date: TODAY, exercises: [row({ progressionAction: 'maintain' })] }]),
    ).toBeNull();
  });

  it('a rest day before a session with a planned increase: progression leads, quietly', () => {
    const next = progressionHighlight([{ when: 'next', date: addDays(TODAY, 1), exercises: [row()] }]);
    const c = coachCase({ today: TODAY, day: { day: restDay(TODAY) }, coach: { progression: next } });
    expect(c.priority).toBe('progression');
  });

  it('never more than a few supporting facts', () => {
    const c = coachCase({
      today: TODAY,
      day: { dayLog: { date: TODAY, mode: 'short' } },
      coach: {
        progression,
        effects: [effect()],
        nutrition: { dayIncomplete: true, planGap: true, shoppingToday: true, missingIngredients: 2 },
        active: [{ key: 'light_week', until: addDays(TODAY, 3), decision: {} as never }],
      },
    });
    expect(c.supportingFacts.length).toBeLessThanOrEqual(MAX_SUPPORTING_FACTS);
  });
});

describe('the cause question (§5–7)', () => {
  it('a rest day after sessions that did not happen: the question leads, nothing is inferred', () => {
    const c = coachCase({ today: TODAY, day: { day: restDay(TODAY) }, facts: NOT_HAPPENED });
    expect(c.priority).toBe('difficulty');
    expect(c.question).toMatchObject({ kind: 'blocker', notHappened: 2 });
    expect(c.question!.options.map((o) => o.value)).toEqual([
      'time',
      'fatigue',
      'pain',
      'motivation',
      'schedule',
      'equipment',
      'other',
    ]);
    expect(c.shownIds).toEqual(['question:blocker']);
    expect(c.offPlan).toBe(false);
  });

  it('a celebration day keeps its moment: the question waits for another day', () => {
    const c = coachCase({ today: TODAY, coach: { celebration: 'first_month' }, facts: NOT_HAPPENED });
    expect([c.celebration, c.question]).toEqual(['first_month', null]);
    expect(c.deferred).toContain('question');
    expect(c.shownIds).toEqual([]);
  });

  it('a session day: the session leads, the question follows', () => {
    const c = coachCase({ today: TODAY, facts: NOT_HAPPENED });
    expect(c.priority).toBe('session');
    expect(c.question?.kind).toBe('blocker');
  });

  it('one session not done is not a pattern: no question', () => {
    expect(coachCase({ today: TODAY, facts: { plannedDates: [addDays(TODAY, -3)] } }).question).toBeNull();
  });

  it('shown yesterday: not today; shown twice in the window: not again (anti-repetition)', () => {
    const shown = (...ago: number[]) => ago.map((d) => ({ id: 'question:blocker', date: addDays(TODAY, -d) }));
    const base = { today: TODAY, day: { day: restDay(TODAY) }, facts: NOT_HAPPENED };
    expect(coachCase({ ...base, coach: { shown: shown(1) } }).question).toBeNull();
    expect(coachCase({ ...base, coach: { shown: shown(CADENCE.observationPauseDays) } }).question).not.toBeNull();
    expect(coachCase({ ...base, coach: { shown: shown(4, 10) } }).question).toBeNull();
    // Shown earlier today: still shown all day (stable within the day).
    expect(coachCase({ ...base, coach: { shown: [{ id: 'question:blocker', date: TODAY }] } }).question).not.toBeNull();
  });

  it('cause → action: each answer reuses an existing path, "autre" invents nothing (§6)', () => {
    const answered = (cause: string, rest = false) =>
      coachCase({
        today: TODAY,
        day: rest ? { day: restDay(TODAY) } : {},
        facts: {
          ...NOT_HAPPENED,
          adjustments: [
            {
              id: 'a1',
              kind: 'planning',
              changeKey: 'coach.blocker',
              from: null,
              to: cause,
              reasonKey: 'coach.question.blocker',
              evidence: {},
              status: 'applied',
              effectiveFrom: TODAY,
              decidedAt: `${TODAY}T08:00:00Z`,
              proposalId: `coach:blocker:${TODAY}`,
            },
          ],
        },
      });
    expect(answered('time').secondary).toMatchObject({ kind: 'route', route: 'adapt_time' });
    expect(answered('time', true).secondary).toMatchObject({ kind: 'route', route: 'program' });
    expect(answered('fatigue').secondary).toMatchObject({ kind: 'route', route: 'adapt' });
    expect(answered('motivation').secondary).toMatchObject({ kind: 'route', route: 'adapt_motivation' });
    expect(answered('pain').secondary).toMatchObject({ kind: 'day_mode', mode: 'difficult' });
    expect(answered('schedule').secondary).toMatchObject({ kind: 'route', route: 'program' });
    expect(answered('equipment').secondary).toBeNull();
    const other = answered('other');
    expect(other.secondary).toBeNull();
    expect(other.supportingFacts.map((f) => f.key)).toContain('coachDay.cause.other');
    // Answered: not asked again.
    expect(other.question).toBeNull();
  });
});

describe('follow-up of an adaptation (§20–21)', () => {
  it('said once, as observed facts, never as a cause', () => {
    const c = coachCase({ today: TODAY, coach: { effects: [effect()] } });
    expect(c.supportingFacts).toContainEqual({
      key: 'coachDay.followup.more_complete',
      params: { change: 'coachDay.change.light_week' },
    });
    expect(c.shownIds).toContain('followup:d1');
    const again = coachCase({
      today: TODAY,
      coach: { effects: [effect()], shown: [{ id: 'followup:d1', date: addDays(TODAY, -1) }] },
    });
    expect(again.supportingFacts.map((f) => f.key)).not.toContain('coachDay.followup.more_complete');
    expect(rendered(c).join(' ')).not.toMatch(/résolu|grâce|a permis|parce que/);
  });

  it('too few sessions since: « pas encore assez de recul »', () => {
    const c = coachCase({
      today: TODAY,
      coach: { effects: [effect({ after: { planned: 1, done: 1, fatigueDays: 0 } })] },
    });
    expect(c.supportingFacts.map((f) => f.key)).toContain('coachDay.followup.not_enough');
  });

  it('while it runs: one line on the session day (« Cette semaine reste allégée. »)', () => {
    const c = coachCase({
      today: TODAY,
      day: { lightWeek: true },
      coach: { active: [{ key: 'light_week', until: addDays(TODAY, 3), decision: {} as never }] },
    });
    expect(c.supportingFacts.map((f) => f.key)).toContain('coachDay.active.light_week');
    expect(c.activeAdaptation).toEqual({ key: 'light_week', until: addDays(TODAY, 3) });
  });
});

describe('stability, tone and explanations (§16, §31, §35, §42, §47)', () => {
  const cases = {
    retour_absence: { today: TODAY, state: { comeback: true }, facts: NOT_HAPPENED },
    fatigue: { today: TODAY, state: { fatigue: 'high' as const } },
    faible_adherence: { today: TODAY, day: { day: restDay(TODAY) }, facts: NOT_HAPPENED },
    reprise: { today: TODAY, state: { comeback: true }, coach: { proposal: proposalOf('restart') } },
    record: { today: TODAY, coach: { celebration: 'first_record', progression } },
    jour_difficile: { today: TODAY, day: { dayLog: { date: TODAY, mode: 'difficult' as const } } },
    suivi: { today: TODAY, coach: { effects: [effect({ observations: ['sessions_less_complete'] })] } },
    nutrition: {
      today: TODAY,
      day: { day: restDay(TODAY) },
      coach: { nutrition: { dayIncomplete: false, planGap: false, shoppingToday: false, missingIngredients: 2 } },
    },
  };

  it.each(Object.entries(cases))('%s: every line exists in FR and EN and passes the tone guard', (_, c) => {
    for (const locale of ['fr', 'en'] as const) {
      const lines = rendered(coachCase(c), locale);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect([line, toneIssues(line)]).toEqual([line, []]);
    }
  });

  it('same facts, same day, same answer (nothing random)', () => {
    for (const c of Object.values(cases)) expect(coachCase(c)).toEqual(coachCase(c));
  });

  it('"direct" or "gentle": only the wording of the voice changes, never what the coach decides', () => {
    for (const c of Object.values(cases)) {
      const gentle = coachCase({ ...c, state: { ...('state' in c ? c.state : {}), tone: 'gentle' } });
      const direct = coachCase({ ...c, state: { ...('state' in c ? c.state : {}), tone: 'direct' } });
      expect(direct).toEqual(gentle);
    }
  });

  it('every priority explains itself: facts → rule → recommendation', () => {
    const c = coachCase(cases.faible_adherence);
    expect(c.explanation.rule.key).toBe('coachDay.rule.difficulty');
    expect(c.explanation.facts).toEqual([
      { key: 'coachDay.basis.not_happened', params: { count: 2, days: CADENCE.observationDays } },
    ]);
  });

  it('reads, never writes its input', () => {
    const input = dayInput(TODAY);
    const daily = buildDailyPlan(input);
    const before = JSON.stringify(daily);
    coachDay({
      daily,
      state: input.state,
      proposal: proposalOf('light_week'),
      celebration: null,
      active: [],
      effects: [],
      blocker: { notHappened: 0, recent: null, answeredToday: null, ask: false },
      shortDay: { remembered: [], question: null, confirmed: [] },
      nutrition: { dayIncomplete: false, planGap: false, shoppingToday: false, missingIngredients: null },
      progression: null,
      shown: [],
    });
    expect(JSON.stringify(daily)).toBe(before);
  });
});
