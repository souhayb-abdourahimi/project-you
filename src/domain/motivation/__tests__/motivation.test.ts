import { comebackPlan, suggestAlternatives, weeklyStreak } from '../anti-abandon';
import { dailyMotivation } from '../messages';

describe('motivation', () => {
  it('uses the user’s own reason when given, deterministically', () => {
    const a = dailyMotivation({ why: 'être fier de moi' }, '2026-09-30');
    expect(a.params.why).toBe('être fier de moi');
    expect(dailyMotivation({ why: 'être fier de moi' }, '2026-09-30')).toEqual(a);
    expect(dailyMotivation({}, '2026-09-30').params).toEqual({});
  });
});

describe('anti-abandon', () => {
  it('prioritises recovery when exhausted', () => {
    expect(suggestAlternatives({ energy: 1, motivation: 3, fatigue: 5, availableMinutes: 60 }, 60).options[0]).toBe(
      'rest',
    );
  });
  it('proposes a short session when time is short', () => {
    expect(suggestAlternatives({ energy: 3, motivation: 3, fatigue: 2, availableMinutes: 20 }, 60).options[0]).toBe(
      'short_session',
    );
    expect(
      suggestAlternatives({ energy: 3, motivation: 3, fatigue: 2, availableMinutes: 10 }, 60).options,
    ).not.toContain('short_session');
  });
  it('offers lighter options when motivation is low, never nothing', () => {
    const advice = suggestAlternatives({ energy: 3, motivation: 1, fatigue: 2, availableMinutes: 60 }, 60);
    expect(advice.options.length).toBeGreaterThan(2);
  });
  it('plans a comeback without resetting everything', () => {
    expect(comebackPlan(1, false)).toBe('simple_restart');
    expect(comebackPlan(4, false)).toBe('gentle_rebuild');
    expect(comebackPlan(0, true)).toBe('reschedule_week');
  });
  it('counts streaks in weeks so one missed day does not break it', () => {
    expect(weeklyStreak([true, false, true, true, true])).toBe(3);
  });
});
