/**
 * docs/DAILY_COACH.md §10: everything is recomputed from raw data on each opening. Measured on one
 * year of dense data before deciding on any cache.
 */
import { addDays } from '../../shared/dates';
import { adapt } from '../adaptation';
import { adherence } from '../adherence';
import { journeyMemory } from '../memory';
import type { ProgressData } from '../progress-facts';
import { buildProgressJourney } from '../progress-journey';
import { retentionRisk } from '../retention';

const START = '2025-10-01';
const TODAY = '2026-09-30';

function year(): ProgressData {
  const data: ProgressData = {
    completedSessions: [],
    setLogs: {},
    weights: [],
    waist: [],
    measurements: [],
    dayLogs: [],
    meals: [],
    weeklyCheckins: [],
  };
  for (let i = 0, d = START; d <= TODAY; i++, d = addDays(d, 1)) {
    data.weights.push({ date: d, weightKg: 85 - i * 0.02 });
    data.dayLogs.push({ date: d, energy: 3, motivation: 3, fatigue: 2 });
    for (const status of ['eaten', 'eaten', 'skipped', 'planned'] as const) data.meals.push({ date: d, status });
    if (i % 2 === 0) {
      data.completedSessions.push({ date: d, sessionIndex: 0, variant: 'full' });
      data.setLogs[`${d}#0`] = Object.fromEntries(
        ['squat', 'bench', 'row', 'press', 'deadlift', 'curl'].map((e) => [
          e,
          [1, 2, 3, 4].map(() => ({ reps: 8, loadKg: 40 + i * 0.05, rpe: 7 })),
        ]),
      );
    }
    if (i % 14 === 0) data.waist.push({ date: d, cm: 95 - i * 0.01 });
    if (i % 7 === 6) data.weeklyCheckins.push({ weekStart: addDays(d, -6), answeredAt: `${d}T18:00:00.000Z` });
  }
  return data;
}

it('one year of data: progress, adherence, adaptation, retention and memory in under 50 ms', () => {
  const fresh = year();
  const planned = fresh.completedSessions.map((s) => s.date);
  // A new set-log object each time: the timed run gets no help from the per-log caches.
  const run = (data = { ...fresh, setLogs: { ...fresh.setLogs } }) => {
    const progress = buildProgressJourney({
      today: TODAY,
      startedOn: START,
      goal: 'fat_loss',
      plannedSessionsPerWeek: 3,
      noPush: false,
      data,
      adherence: { plannedSessionDates: planned, sessionOutcomes: {} },
    });
    const a14 = adherence(
      {
        today: TODAY,
        plannedSessionDates: planned,
        completedSessions: data.completedSessions,
        sessionOutcomes: {},
        meals: data.meals,
      },
      14,
    );
    adapt({
      today: TODAY,
      startedOn: START,
      goal: 'fat_loss',
      safety: { active: false, flags: [] },
      adherence14: a14,
      adherence28: a14,
      missedPerWeek: [0, 0],
      weights: data.weights,
      waist: data.waist,
      trends: progress.performance.exercises,
      setLogs: data.setLogs,
      dayLogs: data.dayLogs,
      rescheduled: {},
      spending: null,
      targets: { calories: 2000, floorKcal: 1600, maintenance: 2400 },
      calorieOffset: 0,
      sessionsPerWeek: { profile: 3, current: 3 },
      adjustments: [],
    });
    retentionRisk({
      today: TODAY,
      startedOn: START,
      plannedSessionDates: planned,
      completedDates: planned,
      sessionOutcomes: {},
      lastActivityBeforeToday: addDays(TODAY, -1),
      dayLogs: data.dayLogs,
      weeklyCheckins: data.weeklyCheckins.map((c) => ({ ...c, weekRating: 4 })),
      recentRpe: 7,
      plateau: false,
      ignoredInARow: 0,
    });
    journeyMemory({
      completedDates: planned,
      weighInDates: data.weights.map((w) => w.date),
      swapReasons: {},
      meals: data.meals.map((m, i) => ({ ...m, id: String(i), recipeId: `r${i % 40}` })),
      milestones: {},
      adjustments: [],
      confirmed: { refusedExerciseIds: [], dislikedRecipeIds: [], likedRecipeIds: [] },
    });
    return progress;
  };
  run(); // warm-up (JIT)
  // Best of 5: the budget is about the code, not about the other test workers sharing the CPU.
  let ms = Infinity;
  let progress = run();
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    progress = run();
    ms = Math.min(ms, performance.now() - t0);
  }
  expect(progress.sinceStart.sessions).toBe(183);
  expect(ms).toBeLessThan(50);
});
