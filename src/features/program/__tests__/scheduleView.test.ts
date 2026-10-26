import { planWeek } from '@/domain/planning/engine';

import { placementSummary, sessionLine } from '../scheduleView';

const WEEK = '2026-09-28';
const training = { sessionsPerWeek: 3, sessionMinutes: 45, hasGym: true, gymTravelMinutes: 15 };
const plan = (busy: { day: 1 | 2 | 3 | 4 | 5 | 6 | 7; start: string; end: string }[] | null) =>
  planWeek({
    weekStart: WEEK,
    schedule: { availability: [], fixedConstraints: [] },
    training,
    ...(busy ? { calendar: { busy } } : {}),
  });

describe('sessionLine', () => {
  it('time, focus, length and place, skipping what is missing', () => {
    expect(sessionLine(['17:30', 'Haut du corps', '≈ 39 min', 'Salle'])).toBe('17:30 · Haut du corps · ≈ 39 min · Salle');
    expect(sessionLine([null, 'Haut du corps', undefined, 'Maison'])).toBe('Haut du corps · Maison');
  });
});

describe('placementSummary', () => {
  it('no calendar and no availability: nothing to say about placement', () => {
    expect(placementSummary(plan(null), 3)).toBeNull();
  });

  it('every session found a free time', () => {
    expect(placementSummary(plan([]), 3)).toEqual({ kind: 'placed', count: 3 });
  });

  it('some sessions only', () => {
    const days = [1, 2, 3, 4, 5, 6] as const;
    const busy = days.map((day) => ({ day, start: '07:00', end: '22:00' }));
    expect(placementSummary(plan(busy), 3)).toEqual({ kind: 'partial', placed: 1, requested: 3 });
  });

  it('no free time long enough: said, never an invented hour', () => {
    const days = [1, 2, 3, 4, 5, 6, 7] as const;
    const busy = days.map((day) => ({ day, start: '07:00', end: '22:00' }));
    expect(placementSummary(plan(busy), 3)).toEqual({ kind: 'none' });
  });
});
