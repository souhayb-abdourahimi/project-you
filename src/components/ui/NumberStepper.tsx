import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parseNumber } from '@/lib/format';
import { MIN_TOUCH, radius, spacing, typography, useColors } from '@/theme';

import { Text } from './Text';

/**
 * Big number with − / + for fast, one-handed entry; the number itself stays typeable (keyboard on
 * web, numeric pad on mobile). Empty is allowed: an unknown value is never filled in for the user.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  decrease,
  increase,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min?: number;
  /** Accessible names of the − and + buttons. */
  decrease: string;
  increase: string;
}) {
  const colors = useColors();
  const [text, setText] = useState(value === null ? '' : String(value));
  // Follows outside changes (prefill, − / +) without fighting what the user is typing ("7," stays).
  const shown = parseNumber(text) === (value ?? undefined) ? text : value === null ? '' : String(value);
  const bump = (delta: number) => {
    const next = Math.max(min, Math.round(((value ?? 0) + delta) * 100) / 100);
    onChange(next);
  };
  return (
    <View style={styles.root}>
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      <View style={styles.row}>
        <StepButton label={decrease} symbol="−" onPress={() => bump(-step)} />
        <TextInput
          accessibilityLabel={label}
          value={shown}
          keyboardType="decimal-pad"
          inputMode="decimal"
          selectTextOnFocus
          onChangeText={(next) => {
            setText(next);
            const n = parseNumber(next);
            onChange(n === undefined ? null : n);
          }}
          style={[
            styles.input,
            typography.display,
            { color: colors.text, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        />
        <StepButton label={increase} symbol="+" onPress={() => bump(step)} />
      </View>
    </View>
  );
}

function StepButton({ label, symbol, onPress }: { label: string; symbol: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text variant="title" color="primary" accessibilityRole="none">
        {symbol}
      </Text>
    </Pressable>
  );
}

const STEP_SIZE = MIN_TOUCH + spacing.md;

const styles = StyleSheet.create({
  root: { flexGrow: 1, flexBasis: 220, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 64,
    height: STEP_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
});
