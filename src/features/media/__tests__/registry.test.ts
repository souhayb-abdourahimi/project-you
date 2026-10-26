import { readdirSync } from 'fs';
import { join } from 'path';

import { EXERCISES } from '@/domain/training/exercises';
import { RECIPES } from '@/domain/meals/recipes';

import { EXERCISE_MEDIA, exerciseMedia } from '../../training/exerciseMedia';
import { RECIPE_MEDIA, recipeMedia } from '../../nutrition/recipeMedia';
import { focusPosition, heroFit, registryProblems, type ValidatedMedia } from '../registry';

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
  size: { width: 1600, height: 900 },
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
        bench_press: media({
          credit: ' ',
          reviewedOn: '',
          alt: { fr: '', en: 'x' },
          focus: { x: 2, y: 0 },
          size: { width: 0, height: 300 },
        }),
      },
      ['bench_press'],
    );
    expect(problems).toEqual([
      'pizza: unknown id',
      'bench_press: missing credit',
      'bench_press: missing review date',
      'bench_press: missing alt text',
      'bench_press: focus outside the picture',
      'bench_press: missing pixel size',
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

  it('a hero is filled only by a large landscape master; small or portrait files are shown whole', () => {
    expect(heroFit(media({ size: { width: 1448, height: 1086 } }))).toBe('cover');
    expect(heroFit(media({ size: { width: 1920, height: 1080 } }))).toBe('cover');
    expect(heroFit(media({ size: { width: 287, height: 509 } }))).toBe('inset');
    expect(heroFit(media({ size: { width: 800, height: 450 } }))).toBe('inset');
    expect(heroFit(media({ size: { width: 1200, height: 1600 } }))).toBe('inset');
  });
});

const ASSETS = join(__dirname, '../../../../assets/media');
const files = (dir: string) =>
  readdirSync(join(ASSETS, dir), { withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => f.name);

describe('media batch 01 (2026-10-17)', () => {
  it('maps exactly the 9 validated exercise files, each to its own exercise id', () => {
    const ids = Object.keys(EXERCISE_MEDIA).sort();
    expect(ids).toEqual([
      'bodyweight_squat',
      'db_bench_press',
      'db_row',
      'db_shoulder_press',
      'deadlift',
      'lat_pulldown',
      'plank',
      'pull_up',
      'push_up',
    ]);
    // One bundled file per registered id, named after it: no duplicate or alternate crop shipped.
    expect(files('exercises').sort()).toEqual(ids.map((id) => `${id}.webp`));
  });

  it('only the exercise with a landscape master fills the hero', () => {
    const cover = Object.entries(EXERCISE_MEDIA)
      .filter(([, m]) => m && heroFit(m) === 'cover')
      .map(([id]) => id);
    expect(cover).toEqual(['bodyweight_squat']);
  });

  it('links a recipe photo only to the exact dish; the other photos stay unlinked', () => {
    expect(Object.keys(RECIPE_MEDIA)).toEqual(['chicken_rice_broccoli']);
    expect(files('recipes')).toEqual(['chicken_rice_broccoli.jpg']);
    const unlinked = files('recipes/unlinked').map((f) => f.replace(/\.jpg$/, ''));
    expect(unlinked.sort()).toEqual([
      'banana_berry_pancakes',
      'berry_banana_smoothie_bowl',
      'penne_meatballs_tomato',
      'salmon_quinoa_vegetables',
      'scrambled_eggs_spinach',
    ]);
    const recipeIds = new Set(RECIPES.map((r) => r.id));
    for (const id of unlinked) {
      expect(recipeIds.has(id)).toBe(false);
      expect(recipeMedia(id)).toBeNull();
    }
  });
});
