/**
 * Journey memory (docs/RETENTION.md §5): structured and derived from recorded data, never free text,
 * never a psychological interpretation, never sensitive data (pain, health, feelings stay in the
 * week they were reported). A preference is only a *suggestion* until the user confirms it; once
 * confirmed it goes to the profile (refused exercises, disliked or liked foods), already synced.
 */
import type { IsoDate, Weekday } from '../shared/dates';
import { weekdayOf } from '../shared/dates';
import type { ReplacementReason } from '../training/replacement';
import type { MealReason } from './outcomes';

export const MEMORY = {
  /** Occurrences, on different sessions or days, before a preference is suggested. */
  repeat: 2,
  likedMeals: 3,
  minSessionsForHabit: 3,
} as const;

export interface MemorySource {
  kind: 'session' | 'meal' | 'weigh_in' | 'milestone' | 'adjustment';
  ref: string;
}

export type MemoryFact =
  | { kind: 'usual_training_day'; weekday: Weekday; count: number; sources: MemorySource[] }
  | { kind: 'usual_weigh_in_day'; weekday: Weekday; count: number; sources: MemorySource[] };

export type MemorySuggestion =
  | { kind: 'drop_exercise'; exerciseId: string; count: number; sources: MemorySource[] }
  | { kind: 'dislike_recipe'; recipeId: string; count: number; sources: MemorySource[] }
  | { kind: 'like_recipe'; recipeId: string; count: number; sources: MemorySource[] };

export type MemoryEvent =
  | { kind: 'milestone'; id: string; on: IsoDate }
  | { kind: 'adjustment'; changeKey: string; status: string; on: IsoDate };

export interface JourneyMemory {
  facts: MemoryFact[];
  suggestions: MemorySuggestion[];
  events: MemoryEvent[];
}

export interface MemoryInput {
  completedDates: IsoDate[];
  weighInDates: IsoDate[];
  /** Keyed `${date}#${sessionIndex}` → from exercise → reason. */
  swapReasons: Record<string, Record<string, ReplacementReason>>;
  meals: { id: string; date: IsoDate; recipeId: string; status: string; reason?: MealReason }[];
  milestones: Record<string, { reachedOn: IsoDate }>;
  adjustments: { changeKey: string; status: string; decidedAt: string }[];
  /** Already in the profile: never suggested again. */
  confirmed: { refusedExerciseIds: string[]; dislikedRecipeIds: string[]; likedRecipeIds: string[] };
}

function usualDay(dates: IsoDate[]): { weekday: Weekday; count: number } | null {
  if (dates.length < MEMORY.minSessionsForHabit) return null;
  const counts = new Map<Weekday, number>();
  for (const d of dates) counts.set(weekdayOf(d), (counts.get(weekdayOf(d)) ?? 0) + 1);
  const [weekday, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  // A habit is a day that holds at least a third of the occurrences, seen at least 3 times.
  return count >= MEMORY.minSessionsForHabit && count * 3 >= dates.length ? { weekday, count } : null;
}

export function journeyMemory(input: MemoryInput): JourneyMemory {
  const facts: MemoryFact[] = [];
  const training = usualDay(input.completedDates);
  if (training) {
    facts.push({
      kind: 'usual_training_day',
      ...training,
      sources: input.completedDates
        .filter((d) => weekdayOf(d) === training.weekday)
        .map((ref) => ({ kind: 'session', ref })),
    });
  }
  const weighIn = usualDay(input.weighInDates);
  if (weighIn) {
    facts.push({
      kind: 'usual_weigh_in_day',
      ...weighIn,
      sources: input.weighInDates
        .filter((d) => weekdayOf(d) === weighIn.weekday)
        .map((ref) => ({ kind: 'weigh_in', ref })),
    });
  }

  const suggestions: MemorySuggestion[] = [];
  // A preference ("je n'aime pas", "préférence", "je ne connais pas la technique") on two different
  // sessions → ask the user; only their confirmation makes it durable (D-031 D). A movement that
  // bothers (`discomfort`) is a safety matter, not a taste: it never becomes a preference here.
  const refused = new Map<string, string[]>();
  for (const [session, swaps] of Object.entries(input.swapReasons)) {
    for (const [exerciseId, reason] of Object.entries(swaps)) {
      if (reason === 'dislike' || reason === 'cant_do' || reason === 'preference')
        refused.set(exerciseId, [...(refused.get(exerciseId) ?? []), session]);
    }
  }
  for (const [exerciseId, sessions] of refused) {
    if (sessions.length >= MEMORY.repeat && !input.confirmed.refusedExerciseIds.includes(exerciseId)) {
      suggestions.push({
        kind: 'drop_exercise',
        exerciseId,
        count: sessions.length,
        sources: sessions.map((ref) => ({ kind: 'session', ref })),
      });
    }
  }
  const byRecipe = (filter: (m: MemoryInput['meals'][number]) => boolean) => {
    const out = new Map<string, MemoryInput['meals']>();
    for (const m of input.meals.filter(filter)) out.set(m.recipeId, [...(out.get(m.recipeId) ?? []), m]);
    return out;
  };
  for (const [recipeId, meals] of byRecipe((m) => m.status !== 'eaten' && m.reason === 'wanted_else')) {
    if (meals.length >= MEMORY.repeat && !input.confirmed.dislikedRecipeIds.includes(recipeId)) {
      suggestions.push({
        kind: 'dislike_recipe',
        recipeId,
        count: meals.length,
        sources: meals.map((m) => ({ kind: 'meal', ref: m.id })),
      });
    }
  }
  for (const [recipeId, meals] of byRecipe((m) => m.status === 'eaten')) {
    const disliked = suggestions.some((s) => s.kind === 'dislike_recipe' && s.recipeId === recipeId);
    if (meals.length >= MEMORY.likedMeals && !disliked && !input.confirmed.likedRecipeIds.includes(recipeId)) {
      suggestions.push({
        kind: 'like_recipe',
        recipeId,
        count: meals.length,
        sources: meals.map((m) => ({ kind: 'meal', ref: m.id })),
      });
    }
  }

  const events: MemoryEvent[] = [
    ...Object.entries(input.milestones).map(([id, m]) => ({ kind: 'milestone' as const, id, on: m.reachedOn })),
    ...input.adjustments
      .filter((a) => a.status !== 'proposed')
      .map((a) => ({
        kind: 'adjustment' as const,
        changeKey: a.changeKey,
        status: a.status,
        on: a.decidedAt.slice(0, 10),
      })),
  ].sort((a, b) => a.on.localeCompare(b.on));

  return { facts, suggestions, events };
}
