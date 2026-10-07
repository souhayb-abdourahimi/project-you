/**
 * The coach of the day (W-7, D-039): « Quelle est la chose la plus utile à dire ou proposer à
 * cette personne aujourd'hui ? ». One deterministic function decides what leads, what follows,
 * what waits and what is not repeated; the screens render its answer and decide nothing.
 *
 * Observe → notice → understand (ask, never guess) → act (existing engines only) → follow up
 * (facts, never a cause) → learn carefully (only what the user confirmed).
 *
 * Priority, first true wins: safety > comeback > structural adaptation > today's session >
 * recurring difficulty > important nutrition > recovery > progression > motivation > light advice.
 * Safety reuses the Safety Engine as it is; a proposal is the Adaptation Engine's own
 * (`primaryProposal`, D-037); a progression is the W-4 decision frozen in the prescription. Nothing
 * here recomputes a target, a load or a plan, and nothing is random: same facts, same day, same
 * answer.
 */
import type { IsoDate, Weekday } from '../shared/dates';
import { daysBetween, weekdayOf } from '../shared/dates';
import type { PlannedExercise } from '../training/program';
import type { Recommendation } from './adaptation';
import { CADENCE, type Blocker, type BlockerSignal, type ShortDayMemory } from './coach-memory';
import type { DailyItem, DailyPlan } from './daily-plan';
import { explainLoad } from './explain';
import type { Copy } from './proposal';
import type { JourneyState } from './state';
import type { ActiveAdaptation, AdaptationEffect } from './structural';

export const COACH_PRIORITIES = [
  'safety',
  'comeback',
  'structural',
  'session',
  'difficulty',
  'nutrition',
  'recovery',
  'progression',
  'motivation',
  'light',
] as const;
export type CoachPriority = (typeof COACH_PRIORITIES)[number];

/** Supporting facts under the main action: a few lines, never a wall of text. */
export const MAX_SUPPORTING_FACTS = 3;

export type CoachRoute = 'adapt' | 'adapt_time' | 'adapt_motivation' | 'program' | 'shopping' | 'nutrition';

export type CoachAction =
  /** One of today's plan items (its row knows how to open it). */
  | { kind: 'item'; itemId: string }
  /** The structural proposal of the day (ProposalCard, D-037). */
  | { kind: 'proposal'; id: string; changeKey: string }
  /** A lighter version of today, in one tap (the existing day modes). */
  | { kind: 'day_mode'; mode: 'short' | 'difficult'; label: Copy }
  | { kind: 'route'; route: CoachRoute; label: Copy };

export interface CoachQuestion {
  /** Anti-repetition id (`question:blocker`, `question:short_day.3`). */
  id: string;
  kind: 'blocker' | 'short_day';
  /** The fact the question comes from, said neutrally. */
  intro: Copy;
  text: Copy;
  options: { value: string; label: Copy }[];
  /** `short_day`: the weekday and the occurrences, stored with the answer. */
  weekday?: Weekday;
  count?: number;
  notHappened?: number;
}

/** What the Nutrition Engine and the real data already say about today (never recomputed). */
export interface NutritionSignals {
  /** Today's plan is incomplete (energy coverage of the meal planner, B1). */
  dayIncomplete: boolean;
  /** The plan cannot be completed with the current constraints (diagnosis, D-021). */
  planGap: boolean;
  /** A shopping trip is planned today. */
  shoppingToday: boolean;
  /** Ingredients missing for today's remaining meals; null without any inventory recorded. */
  missingIngredients: number | null;
}

/** The W-4 decision stored in a prescription: a load increase, said with its own reason. */
export interface ProgressionHighlight {
  exerciseId: string;
  loadKg: number;
  /** The stored reason (explainLoad: `reasons.progression.reason.*`) with its numbers. */
  reason: Copy;
  /** `today`: today's session; `next`: the next planned one. */
  when: 'today' | 'next';
  date: IsoDate;
}

/**
 * The load increase the progression engine already decided for today's session (full version),
 * else for the next planned one: read from the prescription, never recomputed (W-4, D-035).
 */
export function progressionHighlight(
  sessions: readonly { when: 'today' | 'next'; date: IsoDate; exercises: readonly PlannedExercise[] }[],
): ProgressionHighlight | null {
  for (const s of sessions) {
    const row = s.exercises
      .filter((e) => e.variant === 'full' && e.progressionAction === 'increase_load' && e.targetLoadKg !== null)
      .sort((a, b) => a.position - b.position)[0];
    const reason = row ? explainLoad(row) : null;
    if (row && reason)
      return {
        exerciseId: row.exerciseId,
        loadKg: row.targetLoadKg!,
        reason: { key: reason.key, params: reason.params },
        when: s.when,
        date: s.date,
      };
  }
  return null;
}

export interface CoachInput {
  daily: DailyPlan;
  state: JourneyState;
  /** The structural proposal of the day (primaryProposal), if any. */
  proposal: Recommendation | null;
  /** The milestone to celebrate (milestoneToCelebrate: real facts, once, never under safety). */
  celebration: string | null;
  active: readonly ActiveAdaptation[];
  effects: readonly AdaptationEffect[];
  blocker: BlockerSignal;
  shortDay: ShortDayMemory;
  nutrition: NutritionSignals;
  progression: ProgressionHighlight | null;
  /** Coach lines this device showed on earlier days (anti-repetition; today's are ignored). */
  shown: readonly { id: string; date: IsoDate }[];
}

export interface CoachDay {
  date: IsoDate;
  priority: CoachPriority;
  /** The one main action of the day; null when the day is done or nothing is to be done. */
  primary: CoachAction | null;
  supportingFacts: Copy[];
  secondary: CoachAction | null;
  question: CoachQuestion | null;
  /** Milestone id, shown only when nothing more important leads. */
  celebration: string | null;
  /** Safety trigger in force (the Safety Engine's message). */
  safety: string | null;
  /** The temporary structural change in force today, if any. */
  activeAdaptation: { key: ActiveAdaptation['key']; until: IsoDate | null } | null;
  /** A session off plan may be offered (W-6 conditions, plus nothing structural leads). */
  offPlan: boolean;
  /** The user's own "why" is quoted today (engagement drop, comeback, milestone, difficulty). */
  why: boolean;
  /** « Rien de particulier à ajuster aujourd'hui. » */
  calm: boolean;
  /** Signals present today but held back by a higher priority (they come back on a later day). */
  deferred: ('proposal' | 'celebration' | 'question' | 'off_plan' | 'nutrition' | 'progression')[];
  /** Facts → rule → recommendation, for "Pourquoi ?" (journey/explain.ts style). */
  explanation: { rule: Copy; facts: Copy[] };
  /** Coach lines shown today, recorded by the screen for anti-repetition. */
  shownIds: string[];
}

const copy = (key: string, params: Record<string, string | number> = {}): Copy => ({ key, params });

/** Temporary changes whose state is worth a line on a session day. */
const TEMPORARY: ActiveAdaptation['key'][] = ['light_week', 'restart', 'reduce_volume', 'easier_variant'];

/** Same coach line, not again on a later day (one device; the journal covers every device). */
function seenBefore(shown: CoachInput['shown'], id: string, today: IsoDate): boolean {
  return shown.some((s) => s.id === id && s.date < today);
}

/** A question waits a few days after being shown, and is shown at most twice in the window. */
function questionAllowed(shown: CoachInput['shown'], id: string, today: IsoDate): boolean {
  const earlier = shown.filter((s) => s.id === id && s.date < today);
  if (earlier.some((s) => daysBetween(s.date, today) < CADENCE.observationPauseDays)) return false;
  return earlier.filter((s) => daysBetween(s.date, today) < CADENCE.observationDays).length < CADENCE.maxShowings;
}

const BLOCKER_OPTIONS = ['time', 'fatigue', 'pain', 'motivation', 'schedule', 'equipment', 'other'] as const;

function blockerQuestion(notHappened: number): CoachQuestion {
  return {
    id: 'question:blocker',
    kind: 'blocker',
    intro: copy('coachDay.question.blocker.intro'),
    text: copy('coachDay.question.blocker.text'),
    options: BLOCKER_OPTIONS.map((value) => ({ value, label: copy(`coachDay.blocker.${value}`) })),
    notHappened,
  };
}

function shortDayQuestion(weekday: Weekday, count: number): CoachQuestion {
  return {
    id: `question:short_day.${weekday}`,
    kind: 'short_day',
    intro: copy('coachDay.question.short_day.intro', { weekday: `coachDay.weekday.${weekday}`, count }),
    text: copy('coachDay.question.short_day.text'),
    options: [
      { value: 'yes', label: copy('coachDay.question.short_day.yes') },
      { value: 'no', label: copy('coachDay.question.short_day.no') },
    ],
    weekday,
    count,
  };
}

/**
 * Cause → action (§6), reusing what exists: a short session, the declared state of the day, a
 * smaller version, a lighter day, moving a session, a one-off replacement. "Autre": no invented
 * solution. Said once, the day the user answered.
 */
function causeAnswer(cause: Blocker, sessionToday: boolean): { fact: Copy; action: CoachAction | null } {
  const label = (k: string) => copy(`coachDay.action.${k}`);
  switch (cause) {
    case 'time':
      return {
        fact: copy('coachDay.cause.time'),
        action: sessionToday
          ? { kind: 'route', route: 'adapt_time', label: label('short_version') }
          : { kind: 'route', route: 'program', label: label('move_session') },
      };
    case 'fatigue':
      return {
        fact: copy('coachDay.cause.fatigue'),
        action: { kind: 'route', route: 'adapt', label: label('how_i_feel') },
      };
    case 'motivation':
      return {
        fact: copy('coachDay.cause.motivation'),
        action: sessionToday ? { kind: 'route', route: 'adapt_motivation', label: label('smaller_version') } : null,
      };
    case 'pain':
      return {
        fact: copy('coachDay.cause.pain'),
        action: sessionToday ? { kind: 'day_mode', mode: 'difficult', label: label('lighten_today') } : null,
      };
    case 'schedule':
      return {
        fact: copy('coachDay.cause.schedule'),
        action: { kind: 'route', route: 'program', label: label('move_session') },
      };
    case 'equipment':
      return { fact: copy('coachDay.cause.equipment'), action: null };
    default:
      return { fact: copy('coachDay.cause.other'), action: null };
  }
}

/** Follow-up of a temporary change that just ended: observed facts, never a cause (§20–21). */
function followUp(effects: readonly AdaptationEffect[], shown: CoachInput['shown'], today: IsoDate) {
  for (const e of effects) {
    if (e.period.running) continue;
    const since = daysBetween(e.period.to, today);
    if (since < 1 || since > CADENCE.followUpDays) continue;
    const id = `followup:${e.decisionId}`;
    if (seenBefore(shown, id, today)) continue;
    const change = `coachDay.change.${e.changeKey}`;
    const key =
      e.after.planned < CADENCE.minHindsightSessions
        ? 'coachDay.followup.not_enough'
        : e.observations.includes('sessions_more_complete')
          ? 'coachDay.followup.more_complete'
          : e.observations.includes('sessions_less_complete')
            ? 'coachDay.followup.less_complete'
            : e.observations.includes('fatigue_lower')
              ? 'coachDay.followup.fatigue_lower'
              : 'coachDay.followup.same';
    return { id, fact: copy(key, { change }) };
  }
  return null;
}

function nutritionAction(n: NutritionSignals): { fact: Copy; action: CoachAction | null } | null {
  if (n.missingIngredients !== null && n.missingIngredients > 0)
    return {
      fact: copy('coachDay.nutrition.missing_ingredients', { count: n.missingIngredients }),
      action: { kind: 'route', route: 'shopping', label: copy('coachDay.action.shopping') },
    };
  if (n.dayIncomplete)
    return {
      fact: copy('coachDay.nutrition.day_incomplete'),
      action: { kind: 'route', route: 'nutrition', label: copy('coachDay.action.meals') },
    };
  if (n.planGap)
    return {
      fact: copy('coachDay.nutrition.plan_gap'),
      action: { kind: 'route', route: 'nutrition', label: copy('coachDay.action.meals') },
    };
  if (n.shoppingToday)
    return {
      fact: copy('coachDay.nutrition.shopping_today'),
      action: { kind: 'route', route: 'shopping', label: copy('coachDay.action.shopping') },
    };
  return null;
}

const itemAction = (item: DailyItem | null): CoachAction | null => (item ? { kind: 'item', itemId: item.id } : null);

/** The single arbitration of the day. Pure: everything it reads is in its input. */
export function coachDay(input: CoachInput): CoachDay {
  const { daily, state, proposal } = input;
  const today = daily.date;
  const safety = state.safety.active;
  const comeback = !safety && state.momentum.comeback;
  const workoutTodo = daily.items.some((i) => i.kind === 'workout' && i.status === 'todo');
  // A planned session made lighter (difficult day: rest, mobility or a walk instead) is still
  // today's session decision.
  const sessionToday = workoutTodo || (daily.sessionPlanned && daily.mode === 'difficult' && daily.main !== null);
  const deferred: CoachDay['deferred'] = [];
  const shownIds: string[] = [];

  // 1. Which proposal can lead: never under safety; on a comeback only the gentle restart.
  const leadingProposal = proposal && !safety && (!comeback || proposal.change.key === 'restart') ? proposal : null;
  if (proposal && !leadingProposal) deferred.push('proposal');

  // 2. The question of the day (one at most): the cause first, then a habit to confirm.
  let question: CoachQuestion | null = null;
  const questionPossible = !safety && !leadingProposal && !state.journey.firstDay;
  if (input.blocker.ask && questionAllowed(input.shown, 'question:blocker', today)) {
    question = blockerQuestion(input.blocker.notHappened);
  } else if (input.shortDay.question) {
    const q = shortDayQuestion(input.shortDay.question.weekday, input.shortDay.question.count);
    if (questionAllowed(input.shown, q.id, today)) question = q;
  }
  if (question && !questionPossible) {
    deferred.push('question');
    question = null;
  }

  const nutrition = nutritionAction(input.nutrition);
  const recoveryNeeded =
    state.difficulties.fatigue === 'high' ||
    daily.items.some((i) => i.kind === 'recovery' && i.status === 'todo' && i.params.type === 'mobility');

  const priority: CoachPriority = safety
    ? 'safety'
    : comeback
      ? 'comeback'
      : leadingProposal
        ? 'structural'
        : sessionToday
          ? 'session'
          : question?.kind === 'blocker'
            ? 'difficulty'
            : nutrition
              ? 'nutrition'
              : recoveryNeeded
                ? 'recovery'
                : input.progression
                  ? 'progression'
                  : input.celebration || daily.anchor
                    ? 'motivation'
                    : 'light';

  // 3. The main action.
  const main = itemAction(daily.main);
  const primary: CoachAction | null = leadingProposal
    ? { kind: 'proposal', id: leadingProposal.id, changeKey: leadingProposal.change.key }
    : priority === 'nutrition' && nutrition?.action
      ? nutrition.action
      : main;

  // 4. Supporting facts and one optional secondary action.
  const facts: Copy[] = [];
  let secondary: CoachAction | null = null;
  for (const a of daily.adaptations) facts.push(copy(a.key, a.params));

  const temporary = input.active.find((a) => TEMPORARY.includes(a.key)) ?? null;
  if (temporary && (sessionToday || priority === 'structural'))
    facts.push(copy(`coachDay.active.${temporary.key}`, temporary.until ? { date: temporary.until } : {}));

  const answered = input.blocker.answeredToday;
  if (answered && !safety) {
    const answer = causeAnswer(answered, workoutTodo);
    facts.push(answer.fact);
    secondary = answer.action;
  }

  const follow = safety ? null : followUp(input.effects, input.shown, today);
  if (follow) {
    facts.push(follow.fact);
    shownIds.push(follow.id);
  }

  // Progression: only from the stored W-4 decision, only when nothing lighter rules today.
  const progression = input.progression;
  if (progression) {
    const fits =
      (progression.when === 'today' &&
        priority === 'session' &&
        daily.items.some((i) => i.kind === 'workout' && i.status === 'todo' && i.params.variant === 'full')) ||
      (progression.when === 'next' && priority === 'progression');
    if (fits)
      facts.push(
        copy('coachDay.progression', { exercise: progression.exerciseId, load: progression.loadKg }),
        progression.reason,
      );
    else deferred.push('progression');
  }

  // A remembered short day: the short version is offered, the planned session stays the plan.
  const remembered = input.shortDay.remembered.includes(weekdayOf(today));
  if (
    !secondary &&
    remembered &&
    workoutTodo &&
    daily.mode === 'normal' &&
    daily.items.some((i) => i.kind === 'workout' && i.status === 'todo' && i.params.variant === 'full')
  ) {
    facts.push(copy('coachDay.memory.short_day_fact', { weekday: `coachDay.weekday.${weekdayOf(today)}` }));
    secondary = { kind: 'day_mode', mode: 'short', label: copy('coachDay.action.short_version') };
  }

  // Nutrition: the lead on a quiet day, a second line on a session day (case A), never under
  // safety or a comeback (one thing at a time).
  if (nutrition && priority !== 'nutrition') {
    if (!secondary && (priority === 'session' || priority === 'recovery' || priority === 'progression')) {
      facts.push(nutrition.fact);
      secondary = nutrition.action;
    } else deferred.push('nutrition');
  } else if (nutrition) facts.push(nutrition.fact);

  // 5. What waits: a celebration under safety, a comeback, a proposal or the cause question that
  // leads a quiet day (cases C, D); on a celebration day, a question waits for another day.
  const celebrationHeld =
    priority === 'safety' || priority === 'comeback' || priority === 'structural' || priority === 'difficulty';
  const celebration = input.celebration && !celebrationHeld ? input.celebration : null;
  if (input.celebration && celebrationHeld) deferred.push('celebration');
  if (celebration && question) {
    deferred.push('question');
    question = null;
  }

  const offPlan = daily.offPlan && !leadingProposal && !question && priority !== 'recovery';
  if (daily.offPlan && !offPlan) deferred.push('off_plan');

  if (question) shownIds.push(question.id);

  const supportingFacts = facts.slice(0, MAX_SUPPORTING_FACTS);
  const calm =
    !safety &&
    !comeback &&
    !leadingProposal &&
    !question &&
    !celebration &&
    daily.mode === 'normal' &&
    daily.adaptations.length === 0 &&
    supportingFacts.length === 0 &&
    (priority === 'session' || priority === 'light' || priority === 'motivation');

  return {
    date: today,
    priority,
    primary,
    supportingFacts,
    secondary: priority === 'safety' ? null : secondary,
    question,
    celebration,
    safety: safety ? (daily.items.find((i) => i.kind === 'safety')?.params.trigger?.toString() ?? 'safety') : null,
    activeAdaptation: temporary ? { key: temporary.key, until: temporary.until } : null,
    offPlan,
    why: !safety && daily.anchor !== null,
    calm,
    deferred,
    explanation: {
      rule: copy(`coachDay.rule.${priority}`),
      facts: explanationFacts(priority, input),
    },
    shownIds,
  };
}

/** The facts the priority was decided on, each a short line ("Basé sur …"). */
function explanationFacts(priority: CoachPriority, input: CoachInput): Copy[] {
  const { state, daily } = input;
  switch (priority) {
    case 'safety':
      return [copy('coachDay.basis.safety')];
    case 'comeback':
      return [copy('coachDay.basis.comeback', { days: state.momentum.daysSinceActivity ?? 0 })];
    case 'structural':
      return input.proposal ? [copy(input.proposal.reason.key, input.proposal.reason.params)] : [];
    case 'session':
      return [copy(daily.mode === 'normal' ? 'coachDay.basis.schedule' : 'coachDay.basis.day_mode')];
    case 'difficulty':
      return [copy('coachDay.basis.not_happened', { count: input.blocker.notHappened, days: CADENCE.observationDays })];
    case 'nutrition':
      return [copy('coachDay.basis.nutrition')];
    case 'recovery':
      return [copy(state.difficulties.fatigue === 'high' ? 'coachDay.basis.fatigue' : 'coachDay.basis.schedule')];
    case 'progression':
      return [copy('coachDay.basis.progression')];
    default:
      return [copy('coachDay.basis.schedule')];
  }
}
