import { useState } from 'react';

import { TextField } from '@/components/ui';
import { fromKg, toKg } from '@/domain/settings/units';
import { useMassUnit } from '@/hooks/useMassUnit';
import { parseNumber, splitList } from '@/lib/format';

/** Numeric input that keeps the raw text while typing and commits parsed values. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  hint?: string;
  error?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <TextField
      label={label}
      hint={hint}
      error={error}
      value={text}
      keyboardType="decimal-pad"
      inputMode="decimal"
      onChangeText={(next) => {
        setText(next);
        onChange(parseNumber(next));
      }}
    />
  );
}

/**
 * A body weight or a load: typed in the user's unit, kept in kg (D-043). `label` receives the unit
 * as the `unit` parameter of its text.
 */
export function MassField({
  label,
  valueKg,
  onChange,
  hint,
  error,
}: {
  label: (unit: string) => string;
  valueKg: number | undefined;
  onChange: (kg: number | undefined) => void;
  hint?: string;
  error?: string;
}) {
  const unit = useMassUnit();
  return (
    <NumberField
      // A new unit starts a new field: the typed text is never read in the other unit.
      key={unit}
      label={label(unit)}
      hint={hint}
      error={error}
      value={valueKg === undefined ? undefined : fromKg(valueKg, unit)}
      onChange={(v) => onChange(v === undefined ? undefined : toKg(v, unit))}
    />
  );
}

/** Comma-separated free list. */
export function ListField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  hint?: string;
}) {
  const [text, setText] = useState((value ?? []).join(', '));
  return (
    <TextField
      label={label}
      hint={hint}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(splitList(next));
      }}
    />
  );
}

export function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}
