import type { DailyItem } from '@/domain/journey/daily-plan';
import type { PlannedMeal } from '@/domain/meals/planner';
import type { SessionComparison, WeekComparison } from '@/domain/training/compare';

import { heroContent, todayGlance, type GlanceInput } from '../view';

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

const input = (over: Partial<GlanceInput> = {}): GlanceInput => ({
  today: '2026-09-30',
  week: week(),
  meals: [meal('eaten', 31.6), meal('planned', 40), meal('skipped', 20)],
  proteinTargetG: 140,
  kcalTarget: 2400,
  steps: null,
  weight: { currentAvgKg: 75.2, changeKg: -1.4 },
  bodyOrder: ['weight', 'waist', 'consistency'],
  ...over,
});

const session = (date: string, status: SessionComparison['status']) => ({ date, status }) as SessionComparison;

describe('todayGlance: real values only', () => {
  it('nutrition: protein and energy of the meals marked eaten, against the targets', () => {
    expect(todayGlance(input()).nutrition).toEqual({ proteinG: 32, proteinTargetG: 140, kcal: 500, kcalTarget: 2400 });
    expect(todayGlance(input({ meals: null })).nutrition).toBeNull();
  });

  it('the week strip: done, adapted, not done in grey words, planned ahead, rest', () => {
    const strip = todayGlance(
      input({
        week: week({
          sessions: [
            session('2026-09-28', 'completed'),
            session('2026-09-29', 'skipped'),
            session('2026-09-30', 'planned'),
            session('2026-10-01', 'replaced'),
            session('2026-10-03', 'moved'),
          ],
        }),
      }),
    ).week!;
    expect(strip.days.map((d) => d.state)).toEqual(['done', 'not_done', 'planned', 'adapted', 'rest', 'rest', 'rest']);
    expect(strip.days.find((d) => d.today)?.date).toBe('2026-09-30');
    expect(todayGlance(input({ week: week({ prescriptionUnknown: true }) })).week).toBeNull();
    expect(todayGlance(input({ week: week({ planned: 0 }) })).week).toBeNull();
  });

  it('steps: the chart only with three measured days or more, a missing day stays empty', () => {
    const two = todayGlance(
      input({
        steps: [
          { date: '2026-09-30', value: 4000 },
          { date: '2026-09-29', value: 9000 },
        ],
      }),
    );
    expect(two.steps).toEqual({ today: 4000, days: null });
    const three = todayGlance(
      input({
        steps: [
          { date: '2026-09-30', value: 4000 },
          { date: '2026-09-28', value: 8000 },
          { date: '2026-09-24', value: 6000 },
        ],
      }),
    );
    expect(three.steps?.days).toEqual([6000, null, null, null, 8000, null, 4000]);
    expect(todayGlance(input({ steps: [] })).steps).toBeNull();
  });

  it('weight: only when the goal shows it and a real average exists', () => {
    expect(todayGlance(input()).weight).toEqual({ kg: 75.2, changeKg: -1.4 });
    expect(todayGlance(input({ bodyOrder: ['performance', 'consistency'] })).weight).toBeNull();
    expect(todayGlance(input({ weight: { currentAvgKg: null, changeKg: null } })).weight).toBeNull();
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
    expect(
      heroContent(item({ params: { focus: 'upper', minutes: 20, variant: 'short', location: 'gym', start: '18:00' } })),
    ).toEqual({
      focus: 'upper',
      chips: [
        { kind: 'minutes', minutes: 20 },
        { kind: 'variant', variant: 'short' },
        { kind: 'location', location: 'gym' },
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
