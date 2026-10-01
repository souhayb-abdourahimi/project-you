import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { FOOD_CATALOG, FOOD_DEFINITION_IDS, getFood, hasMockFood } from '../../catalog';
import { recipeNutrition } from '../../planner';
import { RECIPES } from '../../recipes';
import generated from '../foods.generated.json';
import { CIQUAL, CIQUAL_CODES, ciqualFood, displayName, parseCiqualValue, type CiqualField } from '..';

/**
 * Consistency suite for the Ciqual 2025 import (D-020). It checks the extract against the source
 * file, the catalogue against the extract and the recipes against the catalogue, so a wrong
 * mapping, a changed source or a hand-edited value fails here.
 */

const ROOT = join(__dirname, '../../../../..');
const SCRIPT = readFileSync(join(ROOT, 'scripts/ciqual/import_ciqual.py'), 'utf8');
const FIELDS = Object.keys(CIQUAL.source.components) as CiqualField[];
const value = (code: string, field: CiqualField) => ciqualFood(code)!.values[field].value;

/** Foods of the former MOCK catalogue that have no faithful Ciqual equivalent (D-020). */
const RETIRED = ['skyr', 'greek_yogurt', 'edamame', 'tvp', 'frozen_berries', 'curry_paste'];

describe('Ciqual source file', () => {
  it('is the unmodified file the extract was generated from', () => {
    const bytes = readFileSync(join(ROOT, 'data/ciqual', CIQUAL.source.file));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(sha256).toBe(CIQUAL.source.sha256);
    expect(SCRIPT).toContain(`SOURCE_SHA256 = '${sha256}'`);
  });

  it('documents its provenance', () => {
    expect(CIQUAL.source).toMatchObject({
      publisher: 'ANSES',
      publishedOn: '2025-11-03',
      url: 'https://ciqual.anses.fr/',
      licence: 'Licence Ouverte / Open Licence (Etalab)',
      rows: 3484,
    });
  });

  it('only uses per-100 g components, in grams or kcal', () => {
    for (const [field, label] of Object.entries(CIQUAL.source.components)) {
      expect(label).toMatch(field === 'energyKcal' ? /\(kcal\/100 g\)$/ : /\(g\/100 g\)$/);
    }
    expect(CIQUAL.source.components.energyKcal).toContain('1169/2011');
    expect(CIQUAL.source.components.proteinG).toContain('Jones');
  });
});

describe('Ciqual values', () => {
  it('parses every Ciqual cell convention and refuses unknown ones', () => {
    expect(parseCiqualValue('12,5')).toEqual({ value: 12.5, status: 'value' });
    expect(parseCiqualValue('0')).toEqual({ value: 0, status: 'value' });
    expect(parseCiqualValue('-')).toEqual({ value: null, status: 'missing' });
    expect(parseCiqualValue(null)).toEqual({ value: null, status: 'missing' });
    expect(parseCiqualValue('traces')).toEqual({ value: 0, status: 'traces' });
    expect(parseCiqualValue('< 0,5')).toEqual({ value: 0, status: 'below_limit' });
    expect(() => parseCiqualValue('12.5 g')).toThrow();
    expect(() => parseCiqualValue('n.d.')).toThrow();
  });

  it('keeps the raw text of every cell next to a value that matches it', () => {
    for (const food of Object.values(CIQUAL.foods)) {
      for (const field of FIELDS) {
        const cell = food.values[field];
        expect({ field, code: food.code, ...parseCiqualValue(cell.raw) }).toEqual({
          field,
          code: food.code,
          value: cell.value,
          status: cell.status,
        });
      }
    }
  });

  it('has plausible values: macros fit in 100 g (source rounding aside) and the energy matches the macros', () => {
    for (const food of Object.values(CIQUAL.foods)) {
      const v = (f: CiqualField) => food.values[f].value ?? 0;
      expect(v('proteinG') + v('carbsG') + v('fatG') + v('fibreG')).toBeLessThanOrEqual(101);
      // Regulation (EU) 1169/2011 factors. The gap left (up to ~5 %, soy and nuts) is consistent with
      // a different protein conversion factor in the energy column; a kJ/kcal or column mix-up is far larger.
      const computed =
        4 * v('proteinG') +
        4 * v('carbsG') +
        9 * v('fatG') +
        2 * v('fibreG') +
        2.4 * v('polyolsG') +
        7 * v('alcoholG') +
        3 * v('organicAcidsG');
      expect({ code: food.code, gap: Math.abs(v('energyKcal') - computed) <= Math.max(3, 0.06 * computed) }).toEqual({
        code: food.code,
        gap: true,
      });
    }
  });

  it('only has missing values outside the components used for calculations', () => {
    for (const food of Object.values(CIQUAL.foods)) {
      for (const field of ['energyKcal', 'proteinG', 'carbsG', 'fatG'] as const) {
        expect(food.values[field].status).not.toBe('missing');
      }
    }
  });

  it('shows Ciqual names on one line', () => {
    expect(displayName(ciqualFood('20591')!)).toBe('Protéine de soja texturée, réhydratée');
  });
});

describe('mapping', () => {
  it('maps every catalogue food to a distinct Ciqual code present in the extract', () => {
    expect(Object.keys(CIQUAL_CODES).sort()).toEqual([...FOOD_DEFINITION_IDS].sort());
    const codes = Object.values(CIQUAL_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Object.keys(generated.foods).sort()).toEqual([...codes].sort());
  });

  it('keeps the mapped foods recognisable (regression on the editorial choices)', () => {
    const names = (id: string) => displayName(ciqualFood(CIQUAL_CODES[id])!);
    expect(names('tofu')).toBe('Tofu nature, préemballé');
    expect(names('tvp_rehydrated')).toBe('Protéine de soja texturée, réhydratée');
    expect(names('rice')).toBe('Riz blanc, cru');
    expect(names('pasta')).toBe('Pâtes sèches, standard, crues');
    expect(names('lentils')).toBe('Lentille, sèche (aliment moyen)');
    expect(names('chickpeas_canned')).toBe('Pois chiche, appertisé, égoutté');
    expect(names('cottage_cheese')).toBe('Fromage blanc, nature, 0% MG');
    expect(names('soy_yogurt')).toMatch(/^Dessert au soja, nature, sans sucres ajoutés/);
  });
});

describe('catalogue', () => {
  it('builds every food from Ciqual, with nothing left out or filled in', () => {
    expect(FOOD_CATALOG.map((f) => f.id)).toEqual(FOOD_DEFINITION_IDS);
    for (const food of FOOD_CATALOG) {
      const code = CIQUAL_CODES[food.id];
      expect(food.ciqualCode).toBe(code);
      expect(food.per100g).toEqual({
        kcal: value(code, 'energyKcal'),
        proteinG: value(code, 'proteinG'),
        carbsG: value(code, 'carbsG'),
        fatG: value(code, 'fatG'),
      });
    }
  });

  it('flags nothing as MOCK and carries the Ciqual provenance', () => {
    for (const food of FOOD_CATALOG) {
      expect(food.meta).toMatchObject({
        provider: 'anses-ciqual',
        externalId: food.ciqualCode,
        confidence: 'high',
        isMock: false,
      });
    }
    expect(hasMockFood(FOOD_CATALOG.map((f) => f.id))).toBe(false);
  });

  it('no longer contains the retired MOCK foods', () => {
    for (const id of RETIRED) expect(getFood(id)).toBeUndefined();
  });
});

describe('recipes', () => {
  it('only use catalogue foods, substitutions included', () => {
    for (const recipe of RECIPES) {
      for (const i of recipe.ingredients)
        expect({ recipe: recipe.id, food: getFood(i.foodId)?.id }).toEqual({ recipe: recipe.id, food: i.foodId });
      for (const [from, to] of Object.entries(recipe.substitutions)) {
        expect(getFood(from)).toBeDefined();
        for (const id of to)
          expect({ recipe: recipe.id, food: getFood(id)?.id }).toEqual({ recipe: recipe.id, food: id });
      }
    }
  });

  it('compute their nutrition from the Ciqual values (recomputed independently here)', () => {
    for (const recipe of RECIPES) {
      const expected = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
      for (const i of recipe.ingredients) {
        const code = CIQUAL_CODES[i.foodId];
        expected.kcal += (value(code, 'energyKcal')! * i.grams) / 100;
        expected.proteinG += (value(code, 'proteinG')! * i.grams) / 100;
        expected.carbsG += (value(code, 'carbsG')! * i.grams) / 100;
        expected.fatG += (value(code, 'fatG')! * i.grams) / 100;
      }
      const actual = recipeNutrition(recipe.ingredients);
      for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
        expect(actual[key]).toBeCloseTo(expected[key], 6);
      }
    }
  });

  it('keep the recalculated values of reference recipes (non-regression)', () => {
    const round = (id: string) => {
      const n = recipeNutrition(RECIPES.find((r) => r.id === id)!.ingredients);
      return { kcal: Math.round(n.kcal), proteinG: Math.round(n.proteinG * 10) / 10 };
    };
    // 150 g chicken (36017) + 80 g rice (9100) + 150 g broccoli (20057) + 8 g olive oil (17270).
    expect(round('chicken_rice_broccoli')).toEqual({ kcal: 565, proteinG: 45.1 });
    // 200 g textured soy, rehydrated (20591) + 70 g pasta (9810) + 200 g sauce (11107) + 50 g onion (20034).
    expect(round('tvp_bolognese')).toEqual({ kcal: 732, proteinG: 49.2 });
  });
});
