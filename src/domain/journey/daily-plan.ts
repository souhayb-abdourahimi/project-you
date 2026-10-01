/**
 * Daily Coach: answers "Qu'est-ce que je dois faire aujourd'hui ?" (docs/DAILY_COACH.md).
 * An output of the Transformation Journey Engine (CLAUDE.md rule 6): it reads JourneyState, today's
 * planned day, today's meals and what the user declared, and returns a short DailyPlan.
 * Priority, first true wins (§4): 1 safety, 2 strong constraints, 3 planned training, 4 nutrition,
 * 5 recovery, 6 activity, 7 motivation. `low_logging` alone is not a constraint (D-027).
 * Only what is relevant today; at most four items; a rest day looks like a rest day.
 */
import type { DailyMealPlan } from '../meals/planner';
import type { PlannedDay } from '../planning/engine';
import { weekdayOf } from '../shared/dates';
import type { SessionVariant } from '../training/adapt';
import { DAY_MODE, isDifficultDay, minimalVersion, type DayContext } from './day-modes';
import type { DayLog, DayMode, SessionOutcome } from './outcomes';
import type { JourneyState } from './state';
import { composeMessage } from './voice/composer';
import { TRIGGER_KIND, kindTooRepeated, pickAnchorSlot, type AnchorContext } from './voice/kinds';
import { hash } from './voice/rotation';
import { safetyMessageFor } from './voice/safety-message';
import type { ComposedMessage, Trigger, VoiceUse } from './voice/types';

export type DayKind = 'first_day' | 'training' | 'rest' | 'comeback' | 'protecting';

export type DailyItemKind = 'safety' | 'workout' | 'meal' | 'recovery' | 'activity' | 'checkin' | 'weigh_in';

export interface DailyItem {
  /** Stable within the day. */
  id: string;
  kind: DailyItemKind;
  status: 'todo' | 'done';
  /** Planned or entered values only. */
  params: Record<string, string | number>;
  /** Explanation key (journey/explain.ts). */
  reason: string;
}

export interface DailyPlan {
  date: string;
  kind: DayKind;
  mode: DayMode;
  greeting: 'hello' | 'first_day' | 'welcome_back';
  items: DailyItem[];
  /** First item still to do (never the safety notice itself); null when the day is done. */
  main: DailyItem | null;
  /** The answer quoted under "Pourquoi tu as commencé" (one of why / change / feel). */
  anchor: { slot: 'why' | 'change' | 'feel'; text: string } | null;
  message: ComposedMessage;
  headline: { key: string; params: Record<string, string | number> };
  adaptations: { key: string; params: Record<string, string | number> }[];
}

export interface DailyPlanInput {
  state: JourneyState;
  day: PlannedDay | null;
  meals: DailyMealPlan | null;
  /** Template of today's planned session. */
  session: { sessionIndex: number; focus: string; minutes: number } | null;
  /** Today's session as done (any variant). */
  completed: { variant: SessionVariant } | null;
  /** Today's session skipped or replaced. */
  outcome: SessionOutcome | null;
  dayLog: DayLog | null;
  freeMinutesToday: number | null;
  fixedConstraintsToday: number;
  /** ISO weekday of the weigh-in (notification preferences). */
  weighInDay: number;
  /** The user logged a weigh-in in the last 30 days. */
  tracksWeight: boolean;
  weighedToday: boolean;
  /** The weekly check-in is open and not answered yet. */
  weeklyCheckinDue: boolean;
  /** Real counts for the headline (journey/progress-journey.ts). */
  counts?: { sessions: number; activeDays: number; weeks: number };
  /** A milestone to celebrate today (journey/milestones.ts), as message facts. */
  milestone?: Record<string, string> | null;
  /** Yesterday was kept in a short, difficult or replaced version. */
  keptGoingYesterday?: boolean;
  /** A light week the user accepted (Adaptation Engine, `light_week`) covers today. */
  lightWeek?: boolean;
  /** Everything the voice already said, on every channel. */
  history: VoiceUse[];
}

export const MAX_DAILY_ITEMS = 4;

type Adaptation = DailyPlan['adaptations'][number];

interface WorkoutDecision {
  item: DailyItem | null;
  /** Replaces the workout when the day calls for rest, mobility or a walk. */
  alternative: DailyItem | null;
  adaptations: Adaptation[];
  /** Facts for the difficult-day message. */
  facts: Record<string, string>;
}

function decideWorkout(input: DailyPlanInput, mode: DayMode, difficult: boolean, ctx: DayContext): WorkoutDecision {
  const { state, session, completed, outcome, dayLog } = input;
  const planned = input.day?.items.find((i) => i.kind === 'workout');
  const none: WorkoutDecision = { item: null, alternative: null, adaptations: [], facts: {} };
  if (!planned || planned.kind !== 'workout' || !session) return none;
  const base = {
    focus: session.focus,
    location: planned.location,
    sessionIndex: planned.sessionIndex,
    ...(planned.start ? { start: planned.start } : {}),
  };
  if (completed) {
    return {
      ...none,
      item: {
        id: 'workout',
        kind: 'workout',
        status: 'done',
        params: { ...base, variant: completed.variant },
        reason: 'workout.done',
      },
    };
  }
  if (outcome?.status === 'replaced') {
    return {
      ...none,
      alternative: {
        id: 'activity',
        kind: 'activity',
        status: 'done',
        params: { activity: outcome.replacedBy ?? 'walk' },
        reason: 'activity.replaced',
      },
    };
  }
  if (outcome?.status === 'skipped') {
    return {
      ...none,
      alternative: {
        id: 'recovery',
        kind: 'recovery',
        status: 'todo',
        params: { type: 'rest' },
        reason: 'recovery.skipped',
      },
      adaptations: [{ key: 'daily.adapt.skipped', params: {} }],
    };
  }

  const slowDown = state.safety.flags.includes('training_load');
  const workout = (variant: SessionVariant, minutes: number, reason: string): DailyItem => ({
    id: 'workout',
    kind: 'workout',
    status: 'todo',
    params: { ...base, variant, minutes },
    reason,
  });
  const recovery = (type: 'rest' | 'mobility', reason: string, minutes?: number): DailyItem => ({
    id: 'recovery',
    kind: 'recovery',
    status: 'todo',
    params: { type, ...(minutes ? { minutes } : {}) },
    reason,
  });

  // 2. Strong constraints: very tired or a difficult day → the minimal version.
  if (difficult) {
    const min = minimalVersion(ctx, { slowDown });
    if (min.kind === 'session') {
      return {
        item: workout('short', min.minutes, 'workout.difficult'),
        alternative: null,
        adaptations: [{ key: 'daily.adapt.difficult_session', params: { from: session.minutes, to: min.minutes } }],
        facts: { minutes: String(min.minutes) },
      };
    }
    const alt =
      min.kind === 'rest'
        ? recovery('rest', 'recovery.difficult')
        : min.kind === 'mobility'
          ? recovery('mobility', 'recovery.difficult', min.minutes)
          : ({
              id: 'activity',
              kind: 'activity',
              status: 'todo',
              params: { activity: 'walk', minutes: min.minutes },
              reason: 'activity.difficult',
            } satisfies DailyItem);
    return {
      item: null,
      alternative: alt,
      adaptations: [{ key: `daily.adapt.difficult_${min.kind}`, params: {} }],
      facts: min.kind === 'rest' ? { rest: '1' } : { walk: '1' },
    };
  }
  // 3. Planned training, adapted to what the user declared.
  if (mode === 'short') {
    return {
      ...none,
      item: workout('short', DAY_MODE.shortSessionMinutes, 'workout.short_day'),
      adaptations: [{ key: 'daily.adapt.short_day', params: { minutes: DAY_MODE.shortSessionMinutes } }],
      facts: { minutes: String(DAY_MODE.shortSessionMinutes) },
    };
  }
  if (mode === 'low_motivation') {
    return {
      ...none,
      item: workout('short', DAY_MODE.minimalSessionMinutes, 'workout.low_motivation'),
      adaptations: [{ key: 'daily.adapt.low_motivation', params: { minutes: DAY_MODE.minimalSessionMinutes } }],
      facts: { minutes: String(DAY_MODE.minimalSessionMinutes) },
    };
  }
  if (state.momentum.comeback) {
    return {
      ...none,
      item: workout('short', DAY_MODE.shortSessionMinutes, 'workout.comeback'),
      adaptations: [{ key: 'daily.adapt.comeback', params: { minutes: DAY_MODE.shortSessionMinutes } }],
    };
  }
  const tired = (slowDown && state.safety.trainingLoadBasis !== 'frequency') || state.difficulties.fatigue === 'high';
  if (tired) {
    return {
      ...none,
      item: workout('light', Math.round(session.minutes * 0.7), 'workout.light'),
      adaptations: [{ key: 'daily.adapt.light', params: {} }],
    };
  }
  if (input.lightWeek) {
    return {
      ...none,
      item: workout('light', Math.round(session.minutes * 0.7), 'workout.light_week'),
      adaptations: [{ key: 'daily.adapt.light_week', params: {} }],
    };
  }
  if (planned.variant === 'short' || (dayLog?.availableMinutes ?? Infinity) < session.minutes) {
    const minutes = Math.min(
      session.minutes,
      Math.max(DAY_MODE.shortSessionMinutes, dayLog?.availableMinutes ?? DAY_MODE.shortSessionMinutes),
    );
    return { ...none, item: workout('short', minutes, 'workout.short_slot') };
  }
  return { ...none, item: workout('full', session.minutes, 'workout.planned') };
}

function mealItem(input: DailyPlanInput): DailyItem | null {
  const meals = input.meals;
  if (!meals || meals.meals.length === 0) return null;
  const logged = meals.meals.filter((m) => m.status !== 'planned').length;
  const next = meals.meals.find((m) => m.status === 'planned');
  return {
    id: 'meal',
    kind: 'meal',
    status: next ? 'todo' : 'done',
    params: {
      // A plan target, labelled "estimation" on screen, never a measurement.
      targetKcal: Math.round(meals.targetKcal / 50) * 50,
      logged,
      total: meals.meals.length,
      ...(next ? { nextSlot: next.slot, nextMealId: next.id } : {}),
    },
    reason: input.state.safety.flags.includes('low_intake') ? 'meal.full_target' : 'meal.planned',
  };
}

function headline(input: DailyPlanInput): DailyPlan['headline'] {
  const { state } = input;
  const c = input.counts;
  const options: DailyPlan['headline'][] = [];
  if (c && c.sessions >= 1) options.push({ key: 'daily.headline.sessions', params: { count: c.sessions } });
  if (c && c.weeks >= 2) options.push({ key: 'daily.headline.weeks', params: { count: c.weeks } });
  if (c && c.activeDays >= 3) options.push({ key: 'daily.headline.activeDays', params: { count: c.activeDays } });
  if (options.length === 0) {
    return state.journey.dayIndex >= 1
      ? { key: 'daily.headline.days', params: { count: state.journey.dayIndex + 1 } }
      : { key: 'daily.headline.start', params: {} };
  }
  // A different real figure from one day to the next.
  return options[hash(state.today) % options.length];
}

function anchorContextFor(kind: DayKind, mode: DayMode, input: DailyPlanInput): AnchorContext {
  if (kind === 'comeback' || mode === 'low_motivation' || (input.dayLog?.motivation ?? 5) <= 2) return 'comeback';
  if (input.milestone) return 'progress';
  if (kind === 'training' || kind === 'first_day') return 'training';
  return 'rest';
}

/** The screen's coach message: mandatory messages first, then a kind not used two days in a row. */
function messageTrigger(
  input: DailyPlanInput,
  kind: DayKind,
  mode: DayMode,
  difficultFacts: Record<string, string>,
): { trigger: Trigger; facts: Record<string, string> } {
  const { state } = input;
  const safety = safetyMessageFor(state.safety);
  if (state.safety.active && safety) return safety;
  if (input.milestone) return { trigger: 'milestone_reached', facts: input.milestone };
  if (kind === 'comeback') return { trigger: 'comeback_welcome', facts: {} };
  if (kind === 'first_day') {
    return { trigger: 'first_day', facts: input.day?.items.some((i) => i.kind === 'workout') ? { workout: '1' } : {} };
  }
  if (mode !== 'normal') return { trigger: 'difficult_day', facts: difficultFacts };
  if (input.keptGoingYesterday) return { trigger: 'encouragement_kept_going', facts: {} };

  const c = input.counts;
  const progressFacts: Record<string, string> | null =
    c && c.sessions >= 3
      ? { sessions: String(c.sessions) }
      : c && c.weeks >= 2
        ? { weeks: String(c.weeks) }
        : c && c.activeDays >= 5
          ? { active_days: String(c.activeDays) }
          : null;
  const pool: { trigger: Trigger; facts: Record<string, string> }[] =
    kind === 'training'
      ? [
          { trigger: 'daily_why', facts: {} },
          { trigger: 'daily_tip', facts: {} },
        ]
      : [
          { trigger: 'rest_day', facts: {} },
          { trigger: 'daily_reflection', facts: {} },
          { trigger: 'daily_tip', facts: {} },
          { trigger: 'daily_why', facts: {} },
        ];
  if (progressFacts && !state.safety.active) pool.push({ trigger: 'progress_note', facts: progressFacts });
  const offset = hash(state.today) % pool.length;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
  const screen = input.history.filter((u) => u.channel === 'screen');
  return rotated.find((c) => !kindTooRepeated(TRIGGER_KIND[c.trigger], screen, state.today)) ?? rotated[0];
}

export function buildDailyPlan(input: DailyPlanInput): DailyPlan {
  const { state } = input;
  const today = state.today;
  const ctx: DayContext = {
    dayLog: input.dayLog,
    plannedSessionMinutes:
      input.session && input.day?.items.some((i) => i.kind === 'workout') ? input.session.minutes : null,
    freeMinutesToday: input.freeMinutesToday,
    fixedConstraintsToday: input.fixedConstraintsToday,
  };
  const difficult = !input.completed && isDifficultDay(ctx);
  const declared = input.dayLog?.mode;
  const mode: DayMode = declared && declared !== 'normal' ? declared : difficult ? 'difficult' : 'normal';
  const decision = decideWorkout(input, mode, mode === 'difficult', ctx);

  const kind: DayKind = state.safety.active
    ? 'protecting'
    : state.journey.firstDay
      ? 'first_day'
      : state.momentum.comeback
        ? 'comeback'
        : decision.item
          ? 'training'
          : 'rest';

  const items: DailyItem[] = [];
  // 1. Safety: the slowing-down notice comes first; the same message as the notifications.
  const safety = safetyMessageFor(state.safety);
  if (state.safety.active && safety) {
    items.push({ id: 'safety', kind: 'safety', status: 'todo', params: { trigger: safety.trigger }, reason: 'safety' });
  }
  if (decision.item) items.push(decision.item);
  if (decision.alternative) items.push(decision.alternative);
  if (!decision.item && !decision.alternative) {
    // A rest day looks like a rest day: recovery, an optional easy walk (comeback: the smallest step).
    const slowDown = state.safety.flags.includes('training_load');
    if (state.momentum.comeback && !slowDown) {
      items.push({
        id: 'activity',
        kind: 'activity',
        status: (input.dayLog?.activity ?? null) ? 'done' : 'todo',
        params: { activity: 'walk', minutes: DAY_MODE.comebackWalkMinutes },
        reason: 'activity.comeback',
      });
    } else {
      const done = input.dayLog?.activity !== undefined;
      items.push({
        id: 'recovery',
        kind: 'recovery',
        status: done ? 'done' : 'todo',
        params:
          slowDown || state.difficulties.fatigue === 'high'
            ? {
                type: state.difficulties.fatigue === 'high' && !slowDown ? 'mobility' : 'rest',
                ...(slowDown ? {} : { minutes: DAY_MODE.mobilityMinutes }),
              }
            : { type: 'rest', walkMinutes: DAY_MODE.walkMinutes },
        reason: slowDown ? 'recovery.safety' : 'recovery.rest_day',
      });
    }
  }
  const meal = mealItem(input);
  if (meal) items.push(meal);
  // Check-in: the neutral low-logging one (never with a real safety signal, D-027), else the weekly one.
  if (state.safety.lowLogging && !state.safety.active) {
    items.push({
      id: 'checkin',
      kind: 'checkin',
      status: 'todo',
      params: { type: 'low_logging' },
      reason: 'checkin.low_logging',
    });
  } else if (input.weeklyCheckinDue) {
    items.push({
      id: 'checkin',
      kind: 'checkin',
      status: 'todo',
      params: { type: 'weekly' },
      reason: 'checkin.weekly',
    });
  }
  const weightGoal = state.goal.family === 'lose' || state.goal.family === 'gain';
  if (weekdayOf(today) === input.weighInDay && (input.tracksWeight || weightGoal)) {
    items.push({
      id: 'weigh_in',
      kind: 'weigh_in',
      status: input.weighedToday ? 'done' : 'todo',
      params: {},
      reason: 'weigh_in.day',
    });
  }
  const kept = items.slice(0, MAX_DAILY_ITEMS);

  const context = anchorContextFor(kind, mode, input);
  const given = (['why', 'change', 'feel'] as const).filter((s) => state.motivation[s]?.trim());
  const earlier = input.history.filter((u) => u.date < today);
  const slot = pickAnchorSlot([...given], context, earlier, today);
  const { trigger, facts } = messageTrigger(input, kind, mode, decision.facts);
  const message = composeMessage({
    trigger,
    date: today,
    facts,
    state,
    // The Today screen is private: the user's own words are always quoted there.
    quotePersonalWords: true,
    // Only days before today: the message stays the same all day long.
    history: earlier,
    anchorContext: context,
  });

  return {
    date: today,
    kind,
    mode,
    greeting: kind === 'first_day' ? 'first_day' : state.momentum.comeback ? 'welcome_back' : 'hello',
    items: kept,
    main: kept.find((i) => i.status === 'todo' && i.kind !== 'safety') ?? null,
    anchor: slot ? { slot, text: state.motivation[slot]!.trim() } : null,
    message,
    headline: headline(input),
    adaptations: decision.adaptations,
  };
}
