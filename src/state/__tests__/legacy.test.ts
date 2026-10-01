import { useDataStore } from '../data';
import { moveLegacyCheckins } from '../legacy';
import { useNotificationStore } from '../notifications';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('moveLegacyCheckins (D-028)', () => {
  beforeEach(() => {
    useDataStore.getState().reset();
    useNotificationStore.getState().reset();
  });

  it('moves device check-ins into the synced day logs once, keeping days already logged', () => {
    useDataStore.getState().logDay('2026-09-29', { energy: 4, mode: 'short' });
    useNotificationStore.setState({
      checkins: [
        { date: '2026-09-28', energy: 2, motivation: 3, fatigue: 4 },
        { date: '2026-09-29', energy: 1, motivation: 1, fatigue: 5 },
      ],
    });
    moveLegacyCheckins();
    expect(useDataStore.getState().dayLogs).toEqual([
      { date: '2026-09-28', energy: 2, motivation: 3, fatigue: 4 },
      { date: '2026-09-29', energy: 4, mode: 'short' },
    ]);
    expect(useNotificationStore.getState().checkins).toEqual([]);
    moveLegacyCheckins();
    expect(useDataStore.getState().dayLogs).toHaveLength(2);
  });
});
