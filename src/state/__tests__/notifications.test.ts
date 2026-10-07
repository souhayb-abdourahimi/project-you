import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/domain/notifications/types';

import { useNotificationStore } from '../notifications';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const migrate = (persisted: unknown, version: number) =>
  useNotificationStore.persist.getOptions().migrate!(persisted, version) as ReturnType<typeof useNotificationStore.getState>;

const { checkin: _c, milestones: _m, ...v2Categories } = DEFAULT_NOTIFICATION_PREFERENCES.categories;
const { quietEnabled: _q, ...v2Rest } = DEFAULT_NOTIFICATION_PREFERENCES;
const v2Defaults = { ...v2Rest, categories: { ...v2Categories, calendar: false } };

describe('notification store v2 → v3 (W-8)', () => {
  it('untouched defaults are not marked saved, so the account keeps its choices', () => {
    const out = migrate({ prefs: v2Defaults, history: [] }, 2);
    expect(out.prefsSaved).toBe(false);
    expect(out.prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
  it('preferences the user changed become the account\'s; progress off keeps checkin and milestones off', () => {
    const out = migrate({ prefs: { ...v2Defaults, categories: { ...v2Defaults.categories, progress: false } } }, 2);
    expect(out.prefsSaved).toBe(true);
    expect(out.prefs.categories).toMatchObject({ progress: false, checkin: false, milestones: false });
    expect(out.prefs.quietEnabled).toBe(true);
  });
  it('a change on the screen marks the preferences saved; reset forgets it', () => {
    useNotificationStore.getState().reset();
    expect(useNotificationStore.getState().prefsSaved).toBe(false);
    useNotificationStore.getState().update({ quietEnabled: false });
    expect(useNotificationStore.getState()).toMatchObject({ prefsSaved: true, prefs: { quietEnabled: false } });
    useNotificationStore.getState().reset();
    expect(useNotificationStore.getState().prefsSaved).toBe(false);
  });
});
