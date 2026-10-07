import type { DailyItem } from '@/domain/journey/daily-plan';
import type { PlannedMeal } from '@/domain/meals/planner';
import type { WeekComparison } from '@/domain/training/compare';

import { heroContent, todaySnapshot, type SnapshotInput } from '../view';

const week = (over: Partial<WeekComparison> = {}): WeekComparison => ({
  weekStart: '2026-09-28',
  prescriptionUnknown: false,
  sessions: [],
  planned: 3,
  done: 1,
  adapted: 0,
  extra: 0,
  ahead: 2,
  setsPlanned: 0,
  setsDone: 0,
  ...over,
});

const meal = (status: PlannedMeal['status'], proteinG: number) =>
  ({ status, nutrition: { kcal: 500, proteinG, carbsG: 50, fatG: 10 } }) as unknown as PlannedMeal;

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  week: week(),
  meals: [meal('eaten', 31.6), meal('planned', 40), meal('skipped', 20)],
  proteinTargetG: 140,
  stepsToday: null,
  weightAvgKg: 75.2,
  bodyOrder: ['weight', 'waist', 'consistency'],
  ...over,
});

describe('todaySnapshot: three real numbers at most', () => {
  it('sessions of the week, protein of the meals marked eaten, then the recent weight', () => {
    expect(todaySnapshot(input())).toEqual([
      { id: 'sessions', done: 1, planned: 3 },
      { id: 'protein', eatenG: 32, targetG: 140 },
      { id: 'weight', kg: 75.2 },
    ]);
  });

  it('measured steps come before the weight', () => {
    expect(todaySnapshot(input({ stepsToday: 6400 })).map((m) => m.id)).toEqual(['sessions', 'protein', 'steps']);
  });

  it('never shows the weight when the goal hides it, nor a value that does not exist', () => {
    const out = todaySnapshot(
      input({ bodyOrder: ['performance', 'consistency'], meals: null, week: week({ planned: 0, done: 0 }) }),
    );
    expect(out).toEqual([]);
    expect(todaySnapshot(input({ weightAvgKg: null })).map((m) => m.id)).toEqual(['sessions', 'protein']);
  });

  it('no denominator for a week whose prescriptions are unknown (W-7.1)', () => {
    expect(todaySnapshot(input({ week: week({ prescriptionUnknown: true }) })).map((m) => m.id)).not.toContain(
      'sessions',
    );
  });
});

const item = (over: Partial<DailyItem>): DailyItem => ({
  id: 'w',
  kind: 'workout',
  status: 'todo',
  params: {},
  reason: 'x',
  ...over,
});

describe('heroContent: planned facts only', () => {
  it('a session to do: its focus, minutes, version and start, on the graphite surface', () => {
    expect(heroContent(item({ params: { focus: 'upper', minutes: 20, variant: 'short', start: '18:00' } }))).toEqual({
      focus: 'upper',
      chips: [
        { kind: 'minutes', minutes: 20 },
        { kind: 'variant', variant: 'short' },
        { kind: 'start', time: '18:00' },
      ],
      tone: 'inverse',
    });
  });

  it('a full session has no version chip; another item stays light and without chips', () => {
    expect(heroContent(item({ params: { focus: 'lower', minutes: 45, variant: 'full' } })).chips).toEqual([
      { kind: 'minutes', minutes: 45 },
    ]);
    expect(heroContent(item({ kind: 'recovery', params: { type: 'rest' } }))).toEqual({
      focus: null,
      chips: [],
      tone: 'surface',
    });
  });
});
