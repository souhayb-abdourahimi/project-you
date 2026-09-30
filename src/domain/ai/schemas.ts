/**
 * Structured outputs the AI coach may propose. Every proposal is parsed here, then re-validated
 * by the relevant deterministic engine before being applied (docs/AI_ARCHITECTURE.md).
 */
import { z } from 'zod';

const id = z.string().min(1).max(100);
const isoDate = z.iso.date();

export const MealReplacementRequest = z.object({
  type: z.literal('meal_replacement'),
  mealId: id,
  reason: z.enum(['replace', 'missing_ingredient', 'faster', 'more_protein', 'cheaper']),
  missingFoodId: id.optional(),
});

export const WorkoutAdjustment = z.object({
  type: z.literal('workout_adjustment'),
  sessionDate: isoDate,
  variant: z.enum(['full', 'short', 'light']),
  replaceExercise: z
    .object({
      exerciseId: id,
      reason: z.enum(['dislike', 'cant_do', 'no_equipment', 'easier', 'harder']),
    })
    .optional(),
});

export const ScheduleChange = z.object({
  type: z.literal('schedule_change'),
  fromDate: isoDate,
  toDate: isoDate,
});

export const InventoryUpdate = z.object({
  type: z.literal('inventory_update'),
  /** Always requires explicit user confirmation before being applied. */
  requiresConfirmation: z.literal(true),
  changes: z
    .array(
      z.object({
        action: z.enum(['add', 'remove']),
        name: z.string().trim().min(1).max(80),
        foodId: id.optional(),
        quantity: z.number().positive().max(100_000),
        unit: z.enum(['g', 'ml', 'piece']),
      }),
    )
    .min(1)
    .max(30),
});

export const MotivationMessageOutput = z.object({
  type: z.literal('motivation_message'),
  text: z.string().trim().min(1).max(280),
});

export const CoachAction = z.discriminatedUnion('type', [
  MealReplacementRequest,
  WorkoutAdjustment,
  ScheduleChange,
  InventoryUpdate,
  MotivationMessageOutput,
]);
export type CoachAction = z.infer<typeof CoachAction>;

/** Rejects (never repairs) anything that does not match a known action. */
export function parseCoachAction(raw: unknown): { ok: true; action: CoachAction } | { ok: false } {
  const parsed = CoachAction.safeParse(raw);
  return parsed.success ? { ok: true, action: parsed.data } : { ok: false };
}
