import { z } from 'zod';

import type { ExternalDataMeta } from '../../shared/external';
import generated from './foods.generated.json';
import mapping from './mapping.json';

/**
 * Official composition data from the ANSES Ciqual 2025 table, extracted by
 * scripts/ciqual/import_ciqual.py from data/ciqual/ (D-020). Raw cells are kept verbatim next to
 * the parsed value; this module only reads them, it never changes a source value.
 */
export type CiqualStatus = 'value' | 'below_limit' | 'traces' | 'missing';

const cell = z.object({
  raw: z.string().nullable(),
  value: z.number().min(0).nullable(),
  status: z.enum(['value', 'below_limit', 'traces', 'missing']),
});

const FIELDS = ['energyKcal', 'proteinG', 'carbsG', 'fatG', 'fibreG', 'polyolsG', 'alcoholG', 'organicAcidsG'] as const;
export type CiqualField = (typeof FIELDS)[number];

const CiqualFile = z.object({
  source: z.object({
    publisher: z.literal('ANSES'),
    dataset: z.string(),
    file: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    url: z.string().url(),
    licence: z.string(),
    rows: z.number().int().positive(),
    components: z.record(z.enum(FIELDS), z.string()),
  }),
  foods: z.record(
    z.string().regex(/^\d+$/),
    z.object({
      code: z.string(),
      name: z.string(),
      group: z.string().nullable(),
      subgroup: z.string().nullable(),
      values: z.object(Object.fromEntries(FIELDS.map((f) => [f, cell])) as Record<CiqualField, typeof cell>),
    }),
  ),
});

export type CiqualFood = z.infer<typeof CiqualFile>['foods'][string];

/** Validated at load: a malformed generated file fails fast instead of feeding wrong numbers. */
export const CIQUAL = CiqualFile.parse(generated);

/** Project You food id → Ciqual alim_code (editorial choice, see docs/DATA_SOURCES.md). */
export const CIQUAL_CODES: Readonly<Record<string, string>> = mapping;

/**
 * Ciqual cell conventions: decimal comma, "-" missing, "traces", "< x" below the quantification
 * limit. Traces and "< x" count as 0 in calculations; the raw text stays available.
 */
export function parseCiqualValue(raw: string | null): { value: number | null; status: CiqualStatus } {
  const text = raw?.trim() ?? '';
  if (text === '' || text === '-') return { value: null, status: 'missing' };
  if (text === 'traces') return { value: 0, status: 'traces' };
  if (/^<\s*\d+(,\d+)?$/.test(text)) return { value: 0, status: 'below_limit' };
  if (/^\d+(,\d+)?$/.test(text)) return { value: Number(text.replace(',', '.')), status: 'value' };
  throw new Error(`Unexpected Ciqual value format: ${text}`);
}

export function ciqualFood(code: string): CiqualFood | undefined {
  return CIQUAL.foods[code];
}

/** Ciqual names are wrapped on several lines in the spreadsheet: display them on one line. */
export function displayName(food: CiqualFood): string {
  return food.name.split(/\s+/).join(' ');
}

/** Provenance of Ciqual values; `code` null describes the whole extract (e.g. a search result list). */
export function ciqualMeta(code: string | null): ExternalDataMeta {
  return {
    provider: 'anses-ciqual',
    externalId: code,
    source: `ANSES, table Ciqual 2025 (${CIQUAL.source.licence})`,
    fetchedAt: `${CIQUAL.source.publishedOn}T00:00:00.000Z`,
    updatedAt: CIQUAL.source.publishedOn,
    confidence: 'high',
    isMock: false,
  };
}
