import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import { addDays } from '../../shared/dates';
import { sessionKey } from '../../shared/ids';
import type { CompareFacts } from '../compare';
import { activeProgram, prescriptionFor } from '../week';
import { adherence } from '../../journey/adherence';
import { plannedSessionDates, programWeek, unknownPrescriptionDates } from '../week-view';

/** W-6 (D-038): past days come from what was prescribed for them, never from today's schedule. */

const SNAP = SCENARIOS.muscleGain;
/** Four sessions on other days (Tuesday, Thursday, Saturday, Sunday): a new version and new slots. */
const FOUR = {
  ...SNAP,
  training: { ...SNAP.training, sessionsPerWeek: 4 },
  schedule: {
    ...SNAP.schedule,
    availability: [2, 4, 6, 7].map((day) => ({ day: day as 2 | 4 | 6 | 7, start: '09:00', end: '20:00' })),
  },
};
const WEEK = '2026-09-28';
const WEDNESDAY = '2026-09-30';
const SEED = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-28T07:00:00.000Z';
const NONE: CompareFacts = { setLogs: {}, completedSessions: [] };

const schedule = (snap: typeof SNAP, weekStart = WEEK) =>
  planWeek({ weekStart, schedule: snap.schedule, training: snap.training }).days;
const workoutDays = (days: ReturnType<typeof schedule>) =>
  days.filter((d) => d.items.some((i) => i.kind === 'workout')).map((d) => d.date);

/** Monday published with 3 sessions; on Wednesday the profile asks for 4 (a new version). */
function changedOnWednesday() {
  const v1 = publishWeek(SNAP, { today: WEEK, weekStart: WEEK, seed: SEED, at: AT });
  const v2 = publishWeek(FOUR, { records: v1, today: WEDNESDAY, weekStart: WEEK, seed: SEED, at: AT });
  return { v1, v2 };
}

describe('programWeek', () => {
  it('a profile changed on Wednesday does not rewrite Monday or Tuesday', () => {
    const { v1, v2 } = changedOnWednesday();
    expect(activeProgram(v2.programs)!.version).toBe(2);
    const now = schedule(FOUR);
    // The new schedule has a session on a past day that was never planned at the time.
    const pastInNew = workoutDays(now).filter((d) => d < WEDNESDAY);
    const pastInOld = workoutDays(schedule(SNAP)).filter((d) => d < WEDNESDAY);
    expect(pastInNew).not.toEqual(pastInOld);

    const days = programWeek({ weekStart: WEEK, today: WEDNESDAY, schedule: now, records: v2, facts: NONE });
    const past = days.filter((d) => d.when === 'past');
    expect(past.filter((d) => d.sessions.length > 0).map((d) => d.date)).toEqual(pastInOld);
    const monday = past.find((d) => d.date === WEEK)!.sessions[0];
    expect(monday.programId).toBe(prescriptionFor(v1, sessionKey(WEEK, 0))!.programId);
    expect(monday.status).toBe('not_recorded');
    // Today and ahead: the current schedule, prescribed by the new version.
    const ahead = days.filter((d) => d.when !== 'past' && d.sessions.length > 0).map((d) => d.date);
    expect(ahead).toEqual(workoutDays(now).filter((d) => d >= WEDNESDAY));
    // Wednesday's session is no longer in the schedule: superseded, it is not shown anymore.
    expect(days.find((d) => d.when === 'today')!.sessions).toEqual([]);
    const next = days.find((d) => d.when === 'future' && d.sessions.length > 0)!;
    expect(next.sessions.every((s) => s.programId === activeProgram(v2.programs)!.id)).toBe(true);
    expect(next.sessions[0].slot).toMatchObject({ location: expect.any(String) });
  });

  it('a session done off plan on a rest day shows on its day as an extra session', () => {
    const r = publishWeek(SNAP, { today: WEEK, weekStart: WEEK, seed: SEED, at: AT });
    const rest = addDays(WEEK, 1);
    const key = sessionKey(rest, 0);
    const facts: CompareFacts = {
      setLogs: { [key]: { squat: [{ reps: 8, loadKg: 60 }] } },
      completedSessions: [{ date: rest, sessionIndex: 0, variant: 'full' }],
      sessionSources: { [key]: { source: 'off_plan', programId: null } },
    };
    const days = programWeek({ weekStart: WEEK, today: WEDNESDAY, schedule: schedule(SNAP), records: r, facts });
    expect(days[1].sessions).toEqual([expect.objectContaining({ source: 'off_plan', status: 'completed' })]);
  });
});

describe('plannedSessionDates', () => {
  it('past days of a recorded week from the prescriptions, today and ahead from the schedule', () => {
    const { v2 } = changedOnWednesday();
    const now = schedule(FOUR);
    const dates = plannedSessionDates({
      records: v2,
      facts: NONE,
      today: WEDNESDAY,
      weeks: [{ weekStart: WEEK, schedule: now }],
    });
    expect(dates).toEqual([
      ...workoutDays(schedule(SNAP)).filter((d) => d < WEDNESDAY),
      ...workoutDays(now).filter((d) => d >= WEDNESDAY),
    ]);
  });

  it('a past week without any prescription: unknown, never rebuilt from the current profile (W-7.1)', () => {
    const earlier = addDays(WEEK, -7);
    const records = { prescriptions: {}, sessionIds: {} };
    const weeks = [{ weekStart: earlier, schedule: schedule(SNAP, earlier) }];
    expect(plannedSessionDates({ records, facts: NONE, today: WEDNESDAY, weeks })).toEqual([]);
    expect(unknownPrescriptionDates({ records, today: WEDNESDAY, weeks })).toEqual(
      Array.from({ length: 7 }, (_, i) => addDays(earlier, i)),
    );
    // Its days say so on the Programme; the week's facts have no denominator.
    const days = programWeek({
      weekStart: earlier,
      today: WEDNESDAY,
      schedule: weeks[0].schedule,
      records,
      facts: NONE,
    });
    expect(days.every((d) => d.prescriptionUnknown && d.sessions.length === 0)).toBe(true);
    // Adherence leaves those days out on both sides: a session done then is not counted against nothing.
    const a = adherence(
      {
        today: WEDNESDAY,
        plannedSessionDates: [],
        unknownDates: unknownPrescriptionDates({ records, today: WEDNESDAY, weeks }),
        completedSessions: [{ date: addDays(earlier, 2), sessionIndex: 1 }],
        sessionOutcomes: {},
        meals: [],
      },
      14,
    );
    expect(a.sessions).toMatchObject({ planned: 0, done: 0, ratio: null, unknownDays: 7 });
  });

  it('a week with its prescriptions stored is known, even on a rest day', () => {
    const week = publishWeek(SNAP, { today: WEEK, weekStart: WEEK, seed: 'local', at: 'x' });
    expect(unknownPrescriptionDates({ records: week, today: addDays(WEEK, 7), weeks: [{ weekStart: WEEK }] })).toEqual(
      [],
    );
  });

  it('a moved session counts on its new day only', () => {
    const r = publishWeek(SNAP, { today: WEEK, weekStart: WEEK, seed: SEED, at: AT });
    const moved = {
      ...r,
      sessionIds: { ...r.sessionIds, [sessionKey('2026-10-01', 1)]: r.sessionIds[sessionKey(WEDNESDAY, 1)] },
    };
    const dates = plannedSessionDates({
      records: moved,
      facts: { ...NONE, rescheduled: { [WEDNESDAY]: '2026-10-01' } },
      today: '2026-10-05',
      weeks: [{ weekStart: WEEK, schedule: schedule(SNAP) }],
    });
    expect(dates).toContain('2026-10-01');
    expect(dates).not.toContain(WEDNESDAY);
  });
});
