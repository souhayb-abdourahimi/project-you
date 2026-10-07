import { useDataStore } from '@/state/data';

export interface MeasureRow {
  id: string;
  date: string;
  kind: 'weight' | 'waist' | 'hips' | 'chest' | 'arm' | 'thigh' | 'neck';
  /** kg for a weight, cm otherwise. */
  value: number;
}

/** Recorded measures, newest first, for the correction screen (D-043 class A: editable). */
export function useMeasurements(limit = 60) {
  const weights = useDataStore((s) => s.weights);
  const waist = useDataStore((s) => s.waist);
  const measurements = useDataStore((s) => s.measurements);
  const store = useDataStore.getState;
  const rows: MeasureRow[] = [
    ...weights.map((w) => ({ id: w.id, date: w.date, kind: 'weight' as const, value: w.weightKg })),
    ...waist.map((w) => ({ id: w.id, date: w.date, kind: 'waist' as const, value: w.cm })),
    ...measurements.map((m) => ({ id: m.id, date: m.date, kind: m.kind, value: m.cm })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind))
    .slice(0, limit);
  return {
    rows,
    total: weights.length + waist.length + measurements.length,
    correct: (row: MeasureRow, value: number) => {
      if (row.kind === 'weight') store().correctWeight(row.id, value);
      else if (row.kind === 'waist') store().correctWaist(row.id, value);
      else store().logMeasurement(row.date, row.kind, value);
    },
    remove: (row: MeasureRow) => {
      if (row.kind === 'weight') store().deleteWeight(row.id);
      else if (row.kind === 'waist') store().deleteWaist(row.id);
      else store().deleteMeasurement(row.id);
    },
  };
}

/** Plausible values (same bounds as the entry screens): a correction never stores an absurd value. */
export const MEASURE_BOUNDS = { weight: [25, 400], length: [10, 300] } as const;

export function isPlausible(kind: MeasureRow['kind'], value: number | undefined): value is number {
  if (value === undefined || !Number.isFinite(value)) return false;
  const [min, max] = kind === 'weight' ? MEASURE_BOUNDS.weight : MEASURE_BOUNDS.length;
  return value >= min && value <= max;
}
