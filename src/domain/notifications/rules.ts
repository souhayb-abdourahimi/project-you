/**
 * When the notification channel speaks (docs/NOTIFICATIONS.md). Each rule reads the week plan and
 * the journey state (the single source of truth, journey/state.ts) and returns candidates; the
 * planner (engine.ts) then applies preferences, cooldowns, the daily cap and the coach's voice.
 * Order of decision: safety → anti-abandon → motivation (CLAUDE.md rule 8).
 */
import type { JourneyState } from '../journey/state';
import { safetyMessageFor } from '../journey/voice/safety-message';
import type { WeeklyPlan } from '../planning/engine';
import { addDays, formatTime, parseTime, type IsoDate } from '../shared/dates';
import type { NotificationPreferences, Trigger } from './types';

export interface Candidate {
  trigger: Trigger;
  date: IsoDate;
  time: string;
  /** A reminder moved out of quiet hours must still come before the event it announces. */
  before?: string;
  /** Interpolated into the message, and used by cooldowns (e.g. `since` for an absence episode). */
  facts: Record<string, string>;
}

export const TRAINING_LEAD_MINUTES = 60;
/** Absence messages: days after the last activity. Then silence until the user is back. */
export const ABSENCE_STEPS: [number, Trigger][] = [
  [2, 'absence_gentle'],
  [5, 'absence_comeback'],
  [10, 'absence_last'],
];
/** Absence messages can be planned this far ahead (they are cancelled as soon as the user is active again). */
export const ABSENCE_HORIZON_DAYS = 14;
export const STREAK_MILESTONES = [2, 3, 4, 6, 8, 12, 16, 20, 26, 39, 52];
export const WEEKLY_REVIEW_TIME = '18:00';
export const STREAK_TIME = '19:00';

/**
 * Only one message of the "motivation" kind per day, best first: celebrating beats reaching out,
 * reaching out beats the daily reminder.
 */
export const MOTIVATION_SLOT_ORDER: Trigger[] = [
  'safety_low_intake',
  'safety_fast_loss',
  'safety_training_load',
  'safety_low_logging',
  'success_session',
  'absence_last',
  'absence_comeback',
  'absence_gentle',
  'fatigue_recovery',
  'daily_why',
];

/** Lower number = kept first when the daily cap is reached. */
export const TRIGGER_PRIORITY: Record<Trigger, number> = {
  safety_low_intake: 0,
  safety_fast_loss: 0,
  safety_training_load: 0,
  safety_low_logging: 0,
  session_planned: 0,
  session_planned_tired: 0,
  weigh_in: 1,
  absence_last: 2,
  absence_comeback: 2,
  absence_gentle: 2,
  meal_planned: 3,
  success_session: 4,
  shopping: 5,
  weekly_progress: 6,
  weekly_checkin: 6,
  success_streak: 7,
  fatigue_recovery: 8,
  daily_why: 9,
  milestone_reached: 6,
  encouragement_kept_going: 4,
  progress_note: 7,
  first_day: 9,
  comeback_welcome: 9,
  difficult_day: 9,
  rest_day: 9,
  daily_tip: 9,
  daily_reflection: 9,
};

export function collectCandidates(input: {
  prefs: NotificationPreferences;
  week: WeeklyPlan;
  state: JourneyState;
  /** Sessions already done (`${date}#${index}`): no reminder for them. */
  completed: Set<string>;
  fromDate: IsoDate;
}): Candidate[] {
  const { prefs, week, state, completed } = input;
  const { safety } = state;
  const safetyMessage = safetyMessageFor(safety);
  // While the safety rule is active: no congratulations, no push (CLAUDE.md rule 8).
  const celebrate = prefs.celebrations && !safety.active;
  // Lighter session reminders when the user declared fatigue; on frequency alone the proposal to
  // slow down is the safety message itself.
  const lighterSessions = safety.flags.includes('training_load') && safety.trainingLoadBasis !== 'frequency';
  // A minor or an underweight user is never congratulated on weight going down (no deficit push).
  const celebrateWeight = !safety.active && !(state.profile.noPush && state.goal.family === 'lose');
  const safetyFacts: Record<string, string> = safety.active ? { safety: '1' } : {};
  const out: Candidate[] = [];
  const workoutDays = new Set<IsoDate>();

  for (const day of week.days) {
    for (const item of day.items) {
      if (item.kind === 'workout') workoutDays.add(day.date);
      if (item.kind === 'workout' && item.start && !completed.has(`${day.date}#${item.sessionIndex}`)) {
        const tired = lighterSessions || (state.difficulties.fatigue === 'high' && day.date === state.today);
        out.push({
          trigger: tired ? 'session_planned_tired' : 'session_planned',
          date: day.date,
          time: formatTime(Math.max(0, parseTime(item.start) - TRAINING_LEAD_MINUTES)),
          before: item.start,
          facts: { time: item.start, ...(item.variant === 'short' ? { short: '1' } : {}), ...safetyFacts },
        });
      }
      if (item.kind === 'shopping') {
        out.push({ trigger: 'shopping', date: day.date, time: item.start, facts: {} });
      }
    }

    const meal = state.plan.mainMeal[day.date];
    out.push({
      trigger: 'meal_planned',
      date: day.date,
      time: prefs.mealReminderTime,
      facts: { ...(meal ? { meal } : {}), ...safetyFacts },
    });

    if (day.weekday === prefs.weighInDay) {
      out.push({ trigger: 'weigh_in', date: day.date, time: prefs.weighInTime, facts: {} });
    }

    if (day.weekday === 7) {
      const sessions = state.progress.sessionsThisWeek;
      out.push(
        state.progress.weightDirection === 'toward_goal' && celebrateWeight
          ? {
              trigger: 'weekly_progress',
              date: day.date,
              time: WEEKLY_REVIEW_TIME,
              facts: sessions > 0 ? { sessions: String(sessions) } : {},
            }
          : { trigger: 'weekly_checkin', date: day.date, time: WEEKLY_REVIEW_TIME, facts: {} },
      );
    }

    if (celebrate && day.date === week.weekStart && STREAK_MILESTONES.includes(state.progress.weeklyStreak)) {
      out.push({
        trigger: 'success_streak',
        date: day.date,
        time: STREAK_TIME,
        facts: { weeks: String(state.progress.weeklyStreak) },
      });
    }

    // Motivation slot candidates for this day (the planner keeps the best one).
    if (safetyMessage && day.date >= state.today) {
      out.push({ ...safetyMessage, date: day.date, time: prefs.motivationTime });
    }
    if (
      celebrate &&
      state.progress.sessionDates.includes(addDays(day.date, -1)) &&
      day.date <= addDays(state.today, 1)
    ) {
      out.push({ trigger: 'success_session', date: day.date, time: prefs.motivationTime, facts: {} });
    }
    if (day.date === state.today && state.difficulties.fatigue === 'high' && !workoutDays.has(day.date)) {
      out.push({ trigger: 'fatigue_recovery', date: day.date, time: prefs.motivationTime, facts: {} });
    }
    if (!safety.active) out.push({ trigger: 'daily_why', date: day.date, time: prefs.motivationTime, facts: {} });
  }

  // Absence: planned ahead from the last active day, cancelled by the next re-plan once the user
  // is back. Never while the safety rule asks to slow down.
  const since = state.momentum.lastActivityDate;
  if (prefs.absenceReminders && since && !safety.active) {
    for (const [days, trigger] of ABSENCE_STEPS) {
      const date = addDays(since, days);
      if (date < input.fromDate || date > addDays(input.fromDate, ABSENCE_HORIZON_DAYS)) continue;
      // A planned session already reaches out that day.
      if (workoutDays.has(date)) continue;
      out.push({ trigger, date, time: prefs.motivationTime, facts: { since, days: String(days) } });
    }
  }
  return out;
}
