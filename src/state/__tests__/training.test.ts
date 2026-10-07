import { SCENARIOS } from '@/domain/scenarios';
import { publishWeek } from '@/domain/scenarios/training';
import { sessionKey } from '@/domain/shared/ids';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useDataStore } from '../data';
import { persistStorage, useStorageHealth } from '../storage';

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

  it('marks a prescribed session opened once, never a day without prescription (D-033)', () => {
    withWeek();
    useDataStore.getState().openSession(WEDNESDAY);
    const at = useDataStore.getState().sessionOpened[WEDNESDAY];
    expect(at).toEqual(expect.any(String));
    useDataStore.getState().openSession(WEDNESDAY);
    expect(useDataStore.getState().sessionOpened[WEDNESDAY]).toBe(at);
    useDataStore.getState().openSession(sessionKey('2026-10-04', 0));
    expect(Object.keys(useDataStore.getState().sessionOpened)).toEqual([WEDNESDAY]);
  });
});

describe('data store, workout session (W-3)', () => {
  beforeEach(() => useDataStore.getState().reset());
  const store = () => useDataStore.getState();

  it('corrects and deletes a set without touching the others', () => {
    withWeek();
    store().logSet(WEDNESDAY, 'squat', { reps: 5, loadKg: 60 });
    store().logSet(WEDNESDAY, 'squat', { reps: 5, loadKg: 60 });
    store().editSet(WEDNESDAY, 'squat', 1, { reps: 6, loadKg: 62.5 });
    expect(store().setLogs[WEDNESDAY].squat).toEqual([
      { reps: 5, loadKg: 60 },
      { reps: 6, loadKg: 62.5 },
    ]);
    store().editSet(WEDNESDAY, 'squat', 5, { reps: 1, loadKg: 1 });
    expect(store().setLogs[WEDNESDAY].squat).toHaveLength(2);
    store().deleteSet(WEDNESDAY, 'squat', 0);
    expect(store().setLogs[WEDNESDAY].squat).toEqual([{ reps: 6, loadKg: 62.5 }]);
    store().deleteSet(WEDNESDAY, 'squat', 0);
    expect(store().setLogs[WEDNESDAY]).toEqual({});
  });

  it('records a hold in seconds', () => {
    withWeek();
    store().logSet(WEDNESDAY, 'plank', { reps: 0, seconds: 40, loadKg: 0 });
    expect(store().setLogs[WEDNESDAY].plank).toEqual([{ reps: 0, seconds: 40, loadKg: 0 }]);
  });

  it('a replacement keeps its reason and can be undone only before any set', () => {
    withWeek();
    store().swapExercise(WEDNESDAY, 'squat', 'goblet_squat', 'busy_equipment');
    expect(store().exerciseSwaps[WEDNESDAY]).toEqual({ squat: 'goblet_squat' });
    expect(store().swapReasons[WEDNESDAY]).toEqual({ squat: 'busy_equipment' });
    store().swapExercise(WEDNESDAY, 'squat', 'squat');
    expect([store().exerciseSwaps[WEDNESDAY], store().swapReasons[WEDNESDAY]]).toEqual([{}, {}]);
    store().swapExercise(WEDNESDAY, 'squat', 'goblet_squat', 'busy_equipment');
    store().logSet(WEDNESDAY, 'goblet_squat', { reps: 10, loadKg: 20 });
    store().swapExercise(WEDNESDAY, 'squat', 'squat');
    expect(store().exerciseSwaps[WEDNESDAY]).toEqual({ squat: 'goblet_squat' });
  });

  it('reports "not performed" with its reason and a 1–5 difficulty; a cleared report is removed', () => {
    withWeek();
    store().reportExercise(WEDNESDAY, 'squat', { notPerformed: true, notPerformedReason: 'no_time' });
    expect(store().exerciseReports[WEDNESDAY]).toEqual({
      squat: { notPerformed: true, notPerformedReason: 'no_time' },
    });
    store().reportExercise(WEDNESDAY, 'squat', { difficulty: 9 });
    expect(store().exerciseReports[WEDNESDAY].squat.difficulty).toBeUndefined();
    store().reportExercise(WEDNESDAY, 'squat', { notPerformed: false, difficulty: 4 });
    expect(store().exerciseReports[WEDNESDAY]).toEqual({ squat: { difficulty: 4 } });
    store().reportExercise(WEDNESDAY, 'squat', null);
    expect(store().exerciseReports[WEDNESDAY]).toEqual({});
  });

  it('a stopped session keeps its reason', () => {
    withWeek();
    store().completeSession({ date: '2026-09-30', sessionIndex: 1, variant: 'full', stopped: 'pain' });
    expect(store().completedSessions).toEqual([
      { date: '2026-09-30', sessionIndex: 1, variant: 'full', stopped: 'pain', completedAt: expect.any(String) },
    ]);
  });

  it('a failed write to the device is reported, and cleared by the next success', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await persistStorage!.setItem('py.test', { state: {}, version: 0 });
    expect(useStorageHealth.getState().saveFailed).toBe(true);
    await persistStorage!.setItem('py.test', { state: {}, version: 0 });
    expect(useStorageHealth.getState().saveFailed).toBe(false);
    setItem.mockRestore();
  });
});
