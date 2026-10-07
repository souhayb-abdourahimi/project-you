import { useMemo } from 'react';

import { explainVersion, type Explanation } from '@/domain/journey/explain';
import { rescheduleOptions } from '@/domain/planning/engine';
import type { IsoDate } from '@/domain/shared/dates';
import { adaptationOfDay, structureFor, type StructuralChange } from '@/domain/training/structure';
import { programWeek, type ProgramSession, type ProgramSlot } from '@/domain/training/week-view';
import type { SessionStatus } from '@/domain/training/compare';
import type { Plan } from '@/hooks/usePlan';
import { useDataStore } from '@/state/data';

/** One session of the week as the Programme screen shows it (keys and values, no text). */
export interface ProgramSessionView {
  key: string;
  date: IsoDate;
  focus: string | null;
  minutes: number | null;
  exerciseCount: number | null;
  slot: ProgramSlot | null;
  status: SessionStatus;
  movedTo: IsoDate | null;
  replacedBy: string | null;
  /** The accepted structural change this session follows (W-5), said on the card. */
  adapted: StructuralChange | null;
  /** Done outside the program, or a second session of the day. */
  extra: boolean;
  /** The workout screen can open it (to start, continue, or read what was done). */
  canOpen: boolean;
  /** Days it can move to this week (D-032): only a session ahead, not started, not moved yet. */
  moveTo: IsoDate[];
}

export interface ProgramDayView {
  date: IsoDate;
  when: 'past' | 'today' | 'future';
  /** A past day of a week without any stored prescription (W-7.1). */
  prescriptionUnknown: boolean;
  sessions: ProgramSessionView[];
}

export interface ProgramWeekView {
  /** The version in force and why it exists ("Programme v2 · exercice remplacé après ta confirmation"). */
  version: (Explanation & { version: number }) | null;
  lightWeek: boolean;
  days: ProgramDayView[];
}

const CLOSED: readonly SessionStatus[] = ['moved', 'skipped', 'replaced', 'not_recorded'];

/**
 * View model of the Programme screen (W-6): the week as planned and lived, from the domain
 * (`week-view.ts`, `compare.ts`, `structure.ts`). The screen only renders what this returns.
 */
export function useProgramWeek(plan: Plan | null): ProgramWeekView | null {
  const data = useDataStore();
  return useMemo(() => {
    if (!plan) return null;
    const structureOf = structureFor(data.adjustments, data, data.completedSessions);
    const movedInto = new Set(Object.values(data.rescheduled));
    const planning = { weekStart: plan.weekStart, schedule: plan.snapshot.schedule, training: plan.snapshot.training };
    const view = (s: ProgramSession, when: ProgramDayView['when']): ProgramSessionView => {
      const p = plan.prescription(s.date, s.sessionIndex);
      // Before the week is frozen (first render), the engine's proposal of the slot.
      const template = p ? null : s.source === 'engine' ? plan.sessionTemplate(s.date, s.sessionIndex) : null;
      const movable =
        when !== 'past' && s.status === 'planned' && s.source === 'engine' && !movedInto.has(s.date) && !s.extra;
      return {
        key: s.key,
        date: s.date,
        focus: s.focus ?? template?.focus ?? null,
        minutes: s.minutes ?? template?.estimatedMinutes ?? null,
        exerciseCount: p ? s.exercises.length : (template?.exercises.length ?? null),
        slot: s.slot,
        status: s.status,
        movedTo: s.movedTo,
        replacedBy: s.replacedBy,
        adapted: s.source === 'engine' ? adaptationOfDay(data.adjustments, p?.adjustmentId, structureOf(s.date)) : null,
        extra: s.extra || s.source !== 'engine',
        canOpen: !CLOSED.includes(s.status) && (when !== 'past' || s.status !== 'planned'),
        moveTo: movable ? rescheduleOptions(plan.schedule, s.date, planning).map((o) => o.date) : [],
      };
    };
    const days = programWeek({
      weekStart: plan.weekStart,
      today: plan.today,
      schedule: plan.schedule.days,
      records: data,
      facts: data,
    }).map((d) => ({
      date: d.date,
      when: d.when,
      prescriptionUnknown: d.prescriptionUnknown,
      sessions: d.sessions.map((s) => view(s, d.when)),
    }));
    const program = plan.program;
    return {
      version: program ? { ...explainVersion(program), version: program.version } : null,
      lightWeek: structureOf(plan.today).lightWeek !== null,
      days,
    };
  }, [plan, data]);
}
