import { SCENARIOS } from '@/domain/scenarios';
import { publishWeek } from '@/domain/scenarios/training';
import { sessionKey } from '@/domain/shared/ids';

import { useDataStore } from '../data';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const WEDNESDAY = sessionKey('2026-09-30', 1);

function withWeek() {
  const week = publishWeek(SCENARIOS.muscleGain, {
    today: '2026-09-28',
    weekStart: '2026-09-28',
    seed: 'local',
    at: '2026-09-28T07:00:00.000Z',
  });
  useDataStore.getState().applyTraining(week);
  return week;
}

describe('data store, Workout Coach (W-2)', () => {
  beforeEach(() => useDataStore.getState().reset());

  it('v3 → v4: keeps every record and re-reads the account once', () => {
    const migrate = useDataStore.persist.getOptions().migrate!;
    const v3 = { setLogs: { [WEDNESDAY]: { squat: [{ reps: 5, loadKg: 60 }] } }, lastPulledAt: '2026-09-30T00:00:00Z' };
    const out = migrate(v3, 3) as ReturnType<typeof useDataStore.getState>;
    expect(out.setLogs).toEqual(v3.setLogs);
    expect(out.lastPulledAt).toBeNull();
    expect([out.programs, out.prescriptions, out.sessionSources]).toEqual([[], {}, {}]);
    const v4 = migrate({ ...v3, programs: [] }, 4) as ReturnType<typeof useDataStore.getState>;
    expect(v4.lastPulledAt).toBe('2026-09-30T00:00:00Z');
  });

  it('records a set on the prescribed session, and a session off plan when the day has none', () => {
    const week = withWeek();
    useDataStore.getState().logSet(WEDNESDAY, 'squat', { reps: 5, loadKg: 60 });
    expect(useDataStore.getState().sessionIds[WEDNESDAY]).toBe(week.sessionIds[WEDNESDAY]);
    expect(useDataStore.getState().sessionSources[WEDNESDAY]).toBeUndefined();
    const sunday = sessionKey('2026-10-04', 0);
    useDataStore.getState().logSet(sunday, 'push_up', { reps: 12, loadKg: 0 });
    expect(useDataStore.getState().sessionSources[sunday]).toEqual({ source: 'off_plan', programId: null });
  });

  it('a reschedule keeps the original and gives the new day the same prescription', () => {
    const week = withWeek();
    useDataStore.getState().reschedule('2026-09-30', '2026-10-01');
    const s = useDataStore.getState();
    expect(s.rescheduled).toEqual({ '2026-09-30': '2026-10-01' });
    expect(s.sessionIds[WEDNESDAY]).toBe(week.sessionIds[WEDNESDAY]);
    const copy = s.prescriptions[s.sessionIds[sessionKey('2026-10-01', 1)]];
    expect(copy.exercises.map((e) => e.exerciseId)).toEqual(
      week.prescriptions[week.sessionIds[WEDNESDAY]].exercises.map((e) => e.exerciseId),
    );
  });

  it('stores the chosen variant and only a valid difficulty (1–5)', () => {
    withWeek();
    useDataStore.getState().chooseVariant(WEDNESDAY, 'light', null);
    expect(useDataStore.getState().sessionVariants).toEqual({ [WEDNESDAY]: 'light' });
    useDataStore.getState().chooseVariant(WEDNESDAY, 'full', null);
    expect(useDataStore.getState().sessionVariants).toEqual({});
    useDataStore.getState().rateSession(WEDNESDAY, 7);
    expect(useDataStore.getState().sessionDifficulty).toEqual({});
    useDataStore.getState().rateSession(WEDNESDAY, 2);
    expect(useDataStore.getState().sessionDifficulty).toEqual({ [WEDNESDAY]: 2 });
  });
});
