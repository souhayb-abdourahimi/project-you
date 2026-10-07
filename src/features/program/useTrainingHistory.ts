import { useMemo } from 'react';

import { explainVersion, type Explanation } from '@/domain/journey/explain';
import { trainingHistory, type DecisionEntry } from '@/domain/journey/training-history';
import type { IsoDate } from '@/domain/shared/dates';
import type { SessionComparison, WeekComparison } from '@/domain/training/compare';
import type { Journey } from '@/hooks/useJourney';
import type { Plan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

/** Weeks read by the history screen (two 6-week cycles). */
export const HISTORY_WEEKS = 12;

export interface HistoryWeekView {
  weekStart: IsoDate;
  current: boolean;
  totals: Omit<WeekComparison, 'sessions' | 'weekStart'>;
  /** Sessions with something to tell: done, started, declared, moved, or past without record. */
  sessions: SessionComparison[];
  versions: (Explanation & { version: number })[];
  decisions: DecisionEntry[];
}

/**
 * View model of the history screen (W-6): week by week, planned vs done in facts, the program
 * versions and their reason, and every answer to a training proposal with what followed it.
 */
export function useTrainingHistory(plan: Plan | null, journey: Journey | null): HistoryWeekView[] | null {
  const data = useDataStore();
  return useMemo(() => {
    if (!plan || !journey) return null;
    return trainingHistory({
      records: data,
      facts: data,
      adjustments: data.adjustments,
      effects: journey.effects,
      today: plan.today,
      weeks: HISTORY_WEEKS,
    }).map(({ weekStart, week, versions, decisions }) => {
      const { sessions, weekStart: _w, ...totals } = week;
      return {
        weekStart,
        current: weekStart === plan.weekStart,
        totals,
        sessions: sessions.filter((s) => s.status !== 'planned'),
        versions: versions.map((v) => ({ ...explainVersion(v), version: v.version })),
        decisions,
      };
    });
  }, [plan, journey, data]);
}
