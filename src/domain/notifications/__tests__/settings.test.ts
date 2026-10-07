import { SAFETY_TRIGGERS } from '../../journey/voice/types';
import { outOfQuietHours } from '../engine';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  TRIGGER_CATEGORY,
  normalizePreferences,
  type Trigger,
} from '../types';

/** Said on the Today screen only, never planned as a notification (types.ts). */
const SCREEN_ONLY: Trigger[] = ['first_day', 'comeback_welcome', 'difficult_day', 'rest_day', 'daily_tip', 'daily_reflection'];

describe('notification categories (W-8: no decorative switch)', () => {
  it('every switch controls at least one real reminder', () => {
    const sent = (Object.keys(TRIGGER_CATEGORY) as Trigger[]).filter(
      (t) => !SCREEN_ONLY.includes(t) && !SAFETY_TRIGGERS.includes(t),
    );
    for (const c of NOTIFICATION_CATEGORIES) {
      expect([c, sent.some((t) => TRIGGER_CATEGORY[t] === c)]).toEqual([c, true]);
    }
  });
  it('the old calendar switch is gone; checkin and milestones have their own', () => {
    expect(NOTIFICATION_CATEGORIES).not.toContain('calendar');
    expect(TRIGGER_CATEGORY.weekly_checkin).toBe('checkin');
    expect(TRIGGER_CATEGORY.milestone_reached).toBe('milestones');
  });
  it('preferences saved before W-8 keep their meaning', () => {
    const old = normalizePreferences({
      enabled: true,
      categories: { training: true, progress: false, calendar: true } as never,
    });
    expect(old.categories).toMatchObject({ progress: false, checkin: false, milestones: false, training: true });
    expect('calendar' in old.categories).toBe(false);
    expect(old.quietEnabled).toBe(true);
    expect(normalizePreferences({})).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe('quiet hours', () => {
  const prefs = { quietEnabled: true, quietStart: '22:00', quietEnd: '07:30' };
  it('across midnight: late evening dropped, early morning moved to the end, day untouched', () => {
    expect(outOfQuietHours('23:15', prefs)).toBeNull();
    expect(outOfQuietHours('06:00', prefs)).toBe('07:30');
    expect(outOfQuietHours('12:00', prefs)).toBe('12:00');
    expect(outOfQuietHours('07:30', prefs)).toBe('07:30');
  });
  it('a range within one day', () => {
    const nap = { quietEnabled: true, quietStart: '13:00', quietEnd: '15:00' };
    expect(outOfQuietHours('14:00', nap)).toBe('15:00');
    expect(outOfQuietHours('12:59', nap)).toBe('12:59');
    expect(outOfQuietHours('15:00', nap)).toBe('15:00');
  });
  it('switched off: nothing is moved', () => {
    expect(outOfQuietHours('23:15', { ...prefs, quietEnabled: false })).toBe('23:15');
  });
  it('start equal to end means no quiet period (the screen warns)', () => {
    expect(outOfQuietHours('03:00', { quietEnabled: true, quietStart: '22:00', quietEnd: '22:00' })).toBe('03:00');
  });
  it('local wall-clock times: a DST night changes nothing (no instant arithmetic)', () => {
    // 2026-10-25 in Europe/Paris: 03:00 → 02:00. The rule reads "HH:MM" of the device only.
    expect(outOfQuietHours('02:30', prefs)).toBe('07:30');
    expect(outOfQuietHours('21:59', prefs)).toBe('21:59');
  });
});
