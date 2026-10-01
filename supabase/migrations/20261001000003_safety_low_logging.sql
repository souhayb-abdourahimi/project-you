-- PR #3 (safety rule for users who log little): new trigger `safety_low_logging` (neutral check-in,
-- one per episode) and its anchor slot `checkin`. Same lists as src/domain/journey/voice/types.ts.

alter table public.notification_history drop constraint notification_history_trigger_check;
alter table public.notification_history add constraint notification_history_trigger_check check (trigger in (
  'session_planned', 'session_planned_tired', 'meal_planned', 'weigh_in', 'shopping',
  'weekly_progress', 'weekly_checkin', 'success_session', 'success_streak',
  'absence_gentle', 'absence_comeback', 'absence_last', 'fatigue_recovery', 'daily_why',
  'safety_low_intake', 'safety_fast_loss', 'safety_training_load', 'safety_low_logging'
));

alter table public.notification_history drop constraint notification_history_anchor_slot_check;
alter table public.notification_history add constraint notification_history_anchor_slot_check
  check (anchor_slot in ('why', 'change', 'feel', 'private', 'none', 'care', 'checkin'));
