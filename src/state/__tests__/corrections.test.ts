/**
 * Correcting a measurement (W-8, class A of docs/SETTINGS_ARCHITECTURE.md): the value of one
 * entry changes or the entry goes, the others are untouched and kept in kg.
 */
import { project } from '@/domain/sync/projection';

import { useDataStore } from '../data';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const USER = '11111111-1111-4111-8111-111111111111';

beforeEach(() => useDataStore.getState().reset());

describe('measurement corrections', () => {
  it('corrects one weigh-in in kg, keeps the others, and deleting one removes only it', () => {
    const store = useDataStore.getState();
    store.logWeight('2026-10-01', 91.4);
    store.logWeight('2026-10-05', 19);
    const [first, typo] = useDataStore.getState().weights;
    useDataStore.getState().correctWeight(typo.id, 90.8);
    expect(useDataStore.getState().weights).toEqual([first, { ...typo, weightKg: 90.8 }]);
    useDataStore.getState().deleteWeight(typo.id);
    expect(useDataStore.getState().weights).toEqual([first]);
  });

  it('a correction is sent as an edit and a deletion as a deletion (no duplicate)', () => {
    useDataStore.getState().logWaist('2026-10-01', 96.5);
    const before = project({ ...useDataStore.getState(), snapshot: null }, USER);
    const [entry] = useDataStore.getState().waist;
    useDataStore.getState().correctWaist(entry.id, 95.5);
    const after = project({ ...useDataStore.getState(), snapshot: null }, USER);
    expect([...after.body_measurements.keys()]).toEqual([...before.body_measurements.keys()]);
    useDataStore.getState().deleteWaist(entry.id);
    expect(project({ ...useDataStore.getState(), snapshot: null }, USER).body_measurements.size).toBe(0);
  });
});
