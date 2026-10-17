import { EXERCISES } from '@/domain/training/exercises';
import { RECIPES } from '@/domain/meals/recipes';

import { EXERCISE_MEDIA, exerciseMedia } from '../../training/exerciseMedia';
import { RECIPE_MEDIA, recipeMedia } from '../../nutrition/recipeMedia';
import { focusPosition, registryProblems, type ValidatedMedia } from '../registry';

/** The 36 ids of the exercise media manifest (poster references, docs/MEDIA.md). */
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

const media = (over: Partial<ValidatedMedia> = {}): ValidatedMedia => ({
  source: { uri: 'https://media.example/x.webp' },
  status: 'validated',
  credit: 'Project You',
  reviewedOn: '2026-10-17',
  alt: { fr: 'Développé couché', en: 'Bench press' },
  ...over,
});

describe('media registries', () => {
  it('the exercise manifest covers exactly the 36 exercises of the catalogue', () => {
    expect(EXERCISES).toHaveLength(36);
    expect([...MANIFEST].sort()).toEqual(EXERCISES.map((e) => e.id).sort());
  });

  it('every registered media is reviewed and belongs to a real exercise or recipe', () => {
    expect(
      registryProblems(
        EXERCISE_MEDIA,
        EXERCISES.map((e) => e.id),
      ),
    ).toEqual([]);
    expect(
      registryProblems(
        RECIPE_MEDIA,
        RECIPES.map((r) => r.id),
      ),
    ).toEqual([]);
  });

  it('flags unknown ids, missing credit, review date or alt text, a focus outside the picture', () => {
    const problems = registryProblems(
      {
        pizza: media(),
        bench_press: media({ credit: ' ', reviewedOn: '', alt: { fr: '', en: 'x' }, focus: { x: 2, y: 0 } }),
      },
      ['bench_press'],
    );
    expect(problems).toEqual([
      'pizza: unknown id',
      'bench_press: missing credit',
      'bench_press: missing review date',
      'bench_press: missing alt text',
      'bench_press: focus outside the picture',
    ]);
  });

  it('only a validated entry is returned, for its own id; nothing otherwise', () => {
    const registry = { bench_press: media() };
    expect(exerciseMedia('bench_press', registry)).toBe(registry.bench_press);
    expect(exerciseMedia('push_up', registry)).toBeNull();
    expect(exerciseMedia('bench_press', { bench_press: { ...media(), status: 'draft' } as never })).toBeNull();
    expect(recipeMedia('overnight_oats', {})).toBeNull();
  });

  it('crop focus becomes an image position, centred by default', () => {
    expect(focusPosition(media())).toEqual({ left: '50%', top: '50%' });
    expect(focusPosition(media({ focus: { x: 0.3, y: 0.25 } }))).toEqual({ left: '30%', top: '25%' });
  });
});
