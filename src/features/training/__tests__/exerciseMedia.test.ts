import { EXERCISES } from '@/domain/training/exercises';

import { EXERCISE_MEDIA, exerciseMedia, type ExerciseMediaEntry } from '../exerciseMedia';

/** The 36 ids of the exercise media manifest (poster references, docs/EXERCISE_MEDIA.md). */
const MANIFEST = [
  'goblet_squat',
  'bodyweight_squat',
  'back_squat',
  'leg_press',
  'romanian_deadlift_db',
  'romanian_deadlift',
  'deadlift',
  'glute_bridge',
  'hip_thrust',
  'kettlebell_swing',
  'reverse_lunge',
  'db_split_squat',
  'bulgarian_split_squat',
  'push_up',
  'incline_push_up',
  'db_bench_press',
  'bench_press',
  'chest_press_machine',
  'pike_push_up',
  'db_shoulder_press',
  'overhead_press',
  'band_row',
  'db_row',
  'barbell_row',
  'seated_cable_row',
  'inverted_row',
  'lat_pulldown',
  'pull_up',
  'band_pulldown',
  'db_curl',
  'band_curl',
  'bench_dip',
  'cable_triceps_pushdown',
  'plank',
  'dead_bug',
  'hanging_knee_raise',
];

describe('exercise media registry', () => {
  it('the media manifest covers exactly the 36 exercises of the catalogue', () => {
    expect(EXERCISES).toHaveLength(36);
    expect([...MANIFEST].sort()).toEqual(EXERCISES.map((e) => e.id).sort());
  });

  it('every registered media belongs to a real exercise and is reviewed', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const [id, entry] of Object.entries(EXERCISE_MEDIA)) {
      expect(ids.has(id)).toBe(true);
      expect(entry?.status).toBe('validated');
      expect(entry?.credit).toBeTruthy();
      expect(entry?.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('no validated media: no photo, the artwork is drawn instead', () => {
    expect(exerciseMedia('bench_press', {})).toBeNull();
    expect(exerciseMedia('unknown', {})).toBeNull();
  });

  it('only a validated entry is returned, for its own exercise', () => {
    const entry: ExerciseMediaEntry = {
      source: { uri: 'https://media.example/bench_press.webp' },
      status: 'validated',
      credit: 'Project You',
      reviewedOn: '2026-10-17',
    };
    const registry = { bench_press: entry };
    expect(exerciseMedia('bench_press', registry)).toEqual(entry.source);
    expect(exerciseMedia('push_up', registry)).toBeNull();
    const unreviewed = { bench_press: { ...entry, status: 'draft' } as unknown as ExerciseMediaEntry };
    expect(exerciseMedia('bench_press', unreviewed)).toBeNull();
  });
});
