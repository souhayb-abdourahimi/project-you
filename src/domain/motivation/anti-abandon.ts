export type Level = 1 | 2 | 3 | 4 | 5;

export interface DailyCheckin {
  energy: Level;
  motivation: Level;
  fatigue: Level;
  /** Minutes the user can give today. */
  availableMinutes: number;
}

export type Alternative = 'full_session' | 'short_session' | 'light_session' | 'walk' | 'mobility' | 'reschedule' | 'rest';

export interface AntiAbandonAdvice {
  /** Most suitable first. The user always picks; nothing is imposed. */
  options: Alternative[];
  messageKey: string;
}

/** "Je n'ai pas envie" / check-in driven options. Never frames anything as a failure. */
export function suggestAlternatives(checkin: DailyCheckin, plannedMinutes: number): AntiAbandonAdvice {
  if (checkin.fatigue >= 5 || checkin.energy <= 1) {
    return { options: ['rest', 'walk', 'mobility', 'reschedule'], messageKey: 'antiAbandon.recover' };
  }
  if (checkin.fatigue >= 4) {
    return { options: ['light_session', 'mobility', 'walk', 'reschedule', 'rest'], messageKey: 'antiAbandon.tired' };
  }
  if (checkin.availableMinutes < plannedMinutes) {
    const options: Alternative[] = checkin.availableMinutes >= 15 ? ['short_session', 'walk', 'reschedule'] : ['walk', 'mobility', 'reschedule'];
    return { options, messageKey: 'antiAbandon.no_time' };
  }
  if (checkin.motivation <= 2) {
    return { options: ['short_session', 'light_session', 'walk', 'reschedule', 'rest'], messageKey: 'antiAbandon.low_motivation' };
  }
  return { options: ['full_session', 'short_session', 'light_session'], messageKey: 'antiAbandon.ready' };
}

export type ComebackPlan = 'normal' | 'simple_restart' | 'gentle_rebuild' | 'reschedule_week';

/**
 * 1 missed day → simple restart; several → adapted rebuild; impossible schedule → reschedule.
 * A missed day never resets progress to zero.
 */
export function comebackPlan(missedDaysInRow: number, scheduleImpossible: boolean): ComebackPlan {
  if (scheduleImpossible) return 'reschedule_week';
  if (missedDaysInRow <= 0) return 'normal';
  if (missedDaysInRow <= 2) return 'simple_restart';
  return 'gentle_rebuild';
}

/**
 * Consistency streak counted in weeks with at least one completed session, so a single missed
 * day never "destroys" it.
 */
export function weeklyStreak(weeksWithSession: boolean[]): number {
  let streak = 0;
  for (let i = weeksWithSession.length - 1; i >= 0; i--) {
    if (!weeksWithSession[i]) break;
    streak++;
  }
  return streak;
}
