import { activitySummary, type ActivitySummary, type AppSessionWindow } from '@/domain/health/merge';
import { sessionKey } from '@/domain/sync/projection';
import type { Plan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';
import { useHealthStore } from '@/state/health';

const DEFAULT_SESSION_MINUTES = 60;

/** Dashboard summary of imported activity, with Project You sessions never counted twice. */
export function useActivitySummary(plan: Plan | null): ActivitySummary | null {
  const connected = useHealthStore((s) => s.connected);
  const data = useHealthStore((s) => s.data);
  const completed = useDataStore((s) => s.completedSessions);
  if (!plan || !connected) return null;
  const sessions: AppSessionWindow[] = completed.map((c) => ({
    key: sessionKey(c.date, c.sessionIndex),
    date: c.date,
    completedAt: c.completedAt,
    durationMin:
      plan.sessionTemplate(c.date, c.sessionIndex, c.variant)?.estimatedMinutes ??
      plan.workoutPlan.sessions[c.sessionIndex]?.estimatedMinutes ??
      DEFAULT_SESSION_MINUTES,
  }));
  return activitySummary(data, sessions, plan.today);
}
