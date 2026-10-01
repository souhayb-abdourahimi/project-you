/**
 * D-025 (docs/DECISIONS.md): the notification master switch also silences safety notifications,
 * and the Today screen banner compensates. This renders the real Today screen with reminders off
 * and checks that the safety message is on screen and the motivation card is not.
 */
import { render, screen } from '@testing-library/react-native';

import TodayScreen from '@/app/(tabs)/index';
import { stateFor } from '@/domain/journey/__fixtures__/journey';
import { planNotifications } from '@/domain/notifications/engine';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/domain/notifications/types';
import { planWeek } from '@/domain/planning/engine';
import { scenario } from '@/domain/scenarios';
import { addDays } from '@/domain/shared/dates';
import fr from '@/i18n/locales/fr';
import i18n from '@/i18n';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const today = '2026-10-01';
const titles = [fr.coach.title.safety_training_load.v1, fr.coach.title.safety_training_load.v2];
const motivationLabel = fr.today.motivation;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(`${today}T10:00:00`), doNotFake: ['nextTick', 'setImmediate'] });
  void i18n.changeLanguage('fr');
  useProfileStore.setState({ snapshot: scenario() });
  useDataStore.setState({ completedSessions: [], weights: [], mealPlan: null, previousMealPlan: null, dayLogs: [] });
  useNotificationStore.setState({ prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false }, checkins: [] });
});

afterEach(() => jest.useRealTimers());

/** Training above plan with declared fatigue: the safety rule is active (training_load). */
function overTrainedAndTired() {
  useDataStore.setState({
    completedSessions: [0, 1, 2, 3].map((i) => ({
      date: addDays(today, -i - 1),
      sessionIndex: 0,
      variant: 'full' as const,
      completedAt: `${addDays(today, -i - 1)}T18:00:00.000Z`,
    })),
  });
  useDataStore.setState({
    dayLogs: [
      { date: addDays(today, -1), energy: 2, motivation: 3, fatigue: 4 },
      { date: today, energy: 2, motivation: 3, fatigue: 5 },
    ],
  });
}

const showsSafetyBanner = () => titles.some((title) => screen.queryByText(new RegExp(title)) !== null);

describe('master switch off: the Today banner still carries the safety message', () => {
  it('shows the safety banner and hides motivation while reminders are off', async () => {
    overTrainedAndTired();
    expect(useNotificationStore.getState().prefs.enabled).toBe(false);
    await render(<TodayScreen />);
    expect(showsSafetyBanner()).toBe(true);
    expect(screen.queryByText(motivationLabel)).toBeNull();
  });

  it('no notification at all is planned in that case (assumed decision)', () => {
    const s = scenario();
    const week = planWeek({ weekStart: '2026-09-28', schedule: s.schedule, training: s.training });
    const planned = planNotifications({
      prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false },
      week,
      state: stateFor({ today, safety: { flags: ['training_load'] } }),
      from: { date: today, time: '00:00' },
    });
    expect(planned).toEqual([]);
  });

  it('shows no banner and the motivation card when nothing is wrong', async () => {
    await render(<TodayScreen />);
    expect(showsSafetyBanner()).toBe(false);
    expect(screen.getByText(motivationLabel)).toBeTruthy();
  });
});
