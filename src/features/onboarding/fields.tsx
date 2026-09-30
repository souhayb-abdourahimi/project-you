import { useState } from 'react';

import { TextField } from '@/components/ui';
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
