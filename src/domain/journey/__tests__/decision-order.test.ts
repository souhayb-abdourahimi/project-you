import { byInstant, decisionFor, effectiveDecisions, revertDecision, sequenced, type Adjustment } from '../adjustments';
import { coachEntries, shortDayAnswer } from '../coach-memory';

/**
 * D-040: order of decisions across devices. Instants, never text; a gesture made after seeing
 * another one comes after it whatever the clocks; concurrent offline answers converge the same way
 * on every device, without claiming to know which gesture really came last.
 */

const TODAY = '2026-10-05';
const proposal = {
  id: 'training:light_week:2026-10-05',
  kind: 'training' as const,
  change: { key: 'light_week' },
  reason: { key: 'adaptation.reason.fatigue_rest' },
  evidence: { fatigueDays: 3 },
  scope: { kind: 'week' as const, days: 7 },
};
const answer = (id: string, status: 'applied' | 'declined' | 'postponed', decidedAt: string) =>
  decisionFor({ id, proposal, status, today: TODAY, decidedAt });

/** Every order in which a journal can be received. */
const permutations = <T>(xs: T[]): T[][] =>
  xs.length <= 1
    ? [xs]
    : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
const winner = (journal: Adjustment[]) => effectiveDecisions(journal).get(proposal.id);

describe('equivalent ISO forms are the same instant (never a text comparison)', () => {
  it('Z, +00:00 and an offset: chronological order', () => {
    // 09:30+02:00 is 07:30Z: earlier than 08:00Z although "09" > "08" as text.
    const a = answer('00000000-0000-4000-8000-00000000000a', 'applied', '2026-10-05T09:30:00+02:00');
    const b = answer('00000000-0000-4000-8000-00000000000b', 'declined', '2026-10-05T08:00:00Z');
    for (const order of permutations([a, b])) expect(winner(order)?.status).toBe('declined');
    expect([a, b].sort(byInstant).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('the same instant written twice: the id decides, the same way everywhere', () => {
    const a = answer('00000000-0000-4000-8000-00000000000a', 'applied', '2026-10-05T08:00:00.000Z');
    const b = answer('00000000-0000-4000-8000-00000000000b', 'declined', '2026-10-05T08:00:00+00:00');
    const results = permutations([a, b]).map((o) => winner(o)?.id);
    expect(new Set(results)).toEqual(new Set([b.id]));
  });
});

describe('diverging clocks: A on time, B 20 minutes ahead (D-040 contract)', () => {
  it('concurrent offline answers: deterministic convergence, both rows kept, no claim of real order', () => {
    // Real order: B answers at 10:00 (its clock says 10:20), A answers at 10:10.
    const onB = sequenced(answer('00000000-0000-4000-8000-0000000000b1', 'declined', '2026-10-05T10:20:00.000Z'), []);
    const onA = sequenced(answer('00000000-0000-4000-8000-0000000000a1', 'applied', '2026-10-05T10:10:00.000Z'), []);
    expect([onA.revision, onB.revision]).toEqual([1, 1]);
    const results = permutations([onA, onB]).map((o) => winner(o)?.id);
    // Same answer on every device, whatever the order of arrival: B's clock is later.
    expect(new Set(results)).toEqual(new Set([onB.id]));
    // Nothing is lost: both answers stay in the journal.
    expect([onA, onB].map((x) => x.status)).toEqual(['applied', 'declined']);
  });

  it('a gesture made after seeing the other one wins, whatever the clocks', () => {
    const onB = sequenced(answer('00000000-0000-4000-8000-0000000000b1', 'declined', '2026-10-05T10:20:00.000Z'), []);
    // A syncs, sees B's answer, and answers again at 10:12 on its (correct) clock.
    const onA = sequenced(answer('00000000-0000-4000-8000-0000000000a2', 'applied', '2026-10-05T10:12:00.000Z'), [onB]);
    expect(onA.revision).toBe(2);
    for (const order of permutations([onA, onB])) expect(winner(order)?.id).toBe(onA.id);
  });

  it('a revert from the device behind still undoes what it saw, and keeps its own time', () => {
    const applied = sequenced(
      answer('00000000-0000-4000-8000-0000000000b1', 'applied', '2026-10-05T10:20:00.000Z'),
      [],
    );
    const back = sequenced(
      revertDecision(applied, {
        id: '00000000-0000-4000-8000-0000000000a3',
        today: TODAY,
        decidedAt: '2026-10-05T10:05:00.000Z',
      }),
      [applied],
    );
    expect(back.decidedAt).toBe('2026-10-05T10:05:00.000Z');
    for (const order of permutations([applied, back])) expect(winner(order)?.status).toBe('reverted');
  });

  it('rows recorded before W-7.1 (no revision) keep their order by instant', () => {
    const legacy = { ...answer('00000000-0000-4000-8000-0000000000c1', 'applied', '2026-10-05T08:00:00Z') };
    delete legacy.revision;
    const later = { ...answer('00000000-0000-4000-8000-0000000000c2', 'declined', '2026-10-05T09:00:00Z') };
    delete later.revision;
    for (const order of permutations([legacy, later])) expect(winner(order)?.id).toBe(later.id);
  });

  it('coach entries follow the same order (a confirmation forgotten from a device behind)', () => {
    const yes = sequenced(
      shortDayAnswer({
        id: '00000000-0000-4000-8000-0000000000d1',
        weekday: 3,
        count: 2,
        status: 'applied',
        today: TODAY,
        decidedAt: '2026-10-05T10:20:00.000Z',
      }),
      [],
    );
    const forget = sequenced(
      revertDecision(yes, {
        id: '00000000-0000-4000-8000-0000000000d2',
        today: TODAY,
        decidedAt: '2026-10-05T10:01:00Z',
      }),
      [yes],
    );
    for (const order of permutations([yes, forget]))
      expect(coachEntries(order).map((e) => e.status)).toEqual(['reverted']);
  });
});
