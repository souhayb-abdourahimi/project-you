/**
 * Notification channel of the Transformation Journey Engine (docs/NOTIFICATIONS.md, D-024):
 * turns the week plan, the journey state and the user's preferences into a short list of
 * personalised local reminders. Deterministic and pure; the service only schedules the result.
 *
 * Pipeline: rules (rules.ts, safety first) → preferences, pause, quiet hours, cooldowns
 * (anti-repetition.ts) → one motivation message per day → daily cap and minimum gap → wording by
 * the journey's voice (journey/voice). Every message = why the user started + one small action
 * now + why it matters. No generative AI.
 */
import type { JourneyState } from '../journey/state';
import { composeMessage } from '../journey/voice/composer';
import { SAFETY_TRIGGERS } from '../journey/voice/types';
import type { WeeklyPlan } from '../planning/engine';
import { addDays, parseTime, type IsoDate } from '../shared/dates';
import { effectiveDailyCap, onCooldown } from './anti-repetition';
import { MOTIVATION_SLOT_ORDER, TRIGGER_PRIORITY, collectCandidates, type Candidate } from './rules';
import {
  TRIGGER_CATEGORY,
  type NotificationHistoryEntry,
  type NotificationPreferences,
  type PlannedNotification,
} from './types';

export * from './types';
export { renderMessage } from '../journey/voice/composer';

const MIN_GAP_MINUTES = 60;

export function isQuiet(time: string, quietStart: string, quietEnd: string): boolean {
  const t = parseTime(time);
  const s = parseTime(quietStart);
  const e = parseTime(quietEnd);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** Moves a reminder out of quiet hours to the end of the quiet period, or drops it. */
function outOfQuietHours(time: string, prefs: NotificationPreferences): string | null {
  if (!isQuiet(time, prefs.quietStart, prefs.quietEnd)) return time;
  // Before the quiet end on the same morning → move to the quiet end; late evening → drop.
  return parseTime(time) < parseTime(prefs.quietEnd) ? prefs.quietEnd : null;
}

export type PlannedWithFacts = PlannedNotification & { facts: Record<string, string> };

export function planNotifications(input: {
  prefs: NotificationPreferences;
  week: WeeklyPlan;
  /** The single source of truth for the user's state (journey/state.ts). */
  state: JourneyState;
  /** Only reminders at or after this moment are planned. */
  from: { date: IsoDate; time: string };
  /** Sessions already done (`${date}#${index}`): no reminder for them. */
  completed?: string[];
  /** Reconciled device history (history.ts): past messages only. */
  history?: NotificationHistoryEntry[];
}): PlannedWithFacts[] {
  const { prefs, state, from } = input;
  if (!prefs.enabled) return [];
  const history = input.history ?? [];

  // 1. Rules → candidates allowed by preferences, pause, quiet hours, the clock and cooldowns.
  const allowed: Candidate[] = [];
  for (const c of collectCandidates({
    prefs,
    week: input.week,
    state,
    completed: new Set(input.completed ?? []),
    fromDate: from.date,
  })) {
    // Safety messages ignore category switches (not the master switch, the pause or quiet hours).
    if (!SAFETY_TRIGGERS.includes(c.trigger) && !prefs.categories[TRIGGER_CATEGORY[c.trigger]]) continue;
    if (prefs.pausedUntil && c.date < prefs.pausedUntil) continue;
    const time = outOfQuietHours(c.time, prefs);
    if (!time || (c.before && time >= c.before)) continue;
    if (c.date < from.date || (c.date === from.date && time < from.time)) continue;
    if (onCooldown(c, history)) continue;
    allowed.push({ ...c, time });
  }

  // 2. One motivation message per day, the most relevant one.
  const slotRank = (c: Candidate) => MOTIVATION_SLOT_ORDER.indexOf(c.trigger);
  const bestSlot = new Map<IsoDate, Candidate>();
  // The low-logging check-in is sent once per episode: once it holds a day's slot, later days keep
  // their usual message instead of losing it to a check-in that the cooldown would drop (D-027).
  let checkinDate: IsoDate | null = null;
  for (const c of [...allowed].sort((a, b) => a.date.localeCompare(b.date))) {
    if (slotRank(c) < 0) continue;
    if (c.trigger === 'safety_low_logging') {
      if (checkinDate !== null && checkinDate !== c.date) continue;
      checkinDate = c.date;
    }
    const current = bestSlot.get(c.date);
    if (!current || slotRank(c) < slotRank(current)) bestSlot.set(c.date, c);
  }
  const candidates = allowed.filter((c) => slotRank(c) < 0 || bestSlot.get(c.date) === c);

  // 3. Per day: highest priority first, respect the (possibly lowered) cap and the minimum gap.
  const cap = effectiveDailyCap(prefs.maxPerDay, history);
  const kept: Candidate[] = [];
  for (const date of [...new Set(candidates.map((c) => c.date))].sort()) {
    const today: Candidate[] = [];
    for (const c of candidates
      .filter((x) => x.date === date)
      .sort((a, b) => TRIGGER_PRIORITY[a.trigger] - TRIGGER_PRIORITY[b.trigger] || a.time.localeCompare(b.time))) {
      if (today.length >= cap) break;
      if (today.some((k) => Math.abs(parseTime(k.time) - parseTime(c.time)) < MIN_GAP_MINUTES)) continue;
      today.push(c);
    }
    kept.push(...today.sort((a, b) => a.time.localeCompare(b.time)));
  }

  // 4. Wording, in chronological order so each message sees the ones planned before it.
  const working = [...history];
  const out: PlannedWithFacts[] = [];
  for (const c of kept) {
    if (onCooldown(c, working)) continue;
    const message = composeMessage({
      trigger: c.trigger,
      date: c.date,
      facts: c.facts,
      state,
      quotePersonalWords: prefs.quotePersonalWords,
      history: working,
    });
    const planned: PlannedWithFacts = {
      ...message,
      id: `${c.date}:${c.trigger}`,
      trigger: c.trigger,
      category: TRIGGER_CATEGORY[c.trigger],
      date: c.date,
      time: c.time,
      facts: c.facts,
    };
    out.push(planned);
    working.push({
      id: planned.id,
      trigger: planned.trigger,
      category: planned.category,
      templateId: planned.templateId,
      anchorSlot: planned.anchorSlot,
      date: planned.date,
      time: planned.time,
      status: 'scheduled',
      facts: planned.facts,
      scheduledAt: '',
    });
  }
  return out;
}

/** Next week's start helper for rescheduling at the end of the week. */
export const nextWeekStart = (weekStart: IsoDate) => addDays(weekStart, 7);
