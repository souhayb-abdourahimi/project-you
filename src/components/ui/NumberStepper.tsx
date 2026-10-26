import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parseNumber } from '@/lib/format';
import { MIN_TOUCH, radius, spacing, typography, useColors } from '@/theme';

import { Icon } from './Icon';
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
  compact,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min?: number;
  /** Accessible names of the − and + buttons. */
  decrease: string;
  increase: string;
  /** Two side by side on a phone (set entry, portions): 44 pt buttons, a smaller number. */
  compact?: boolean;
  /** Short unit drawn after the number ("kg", "g"), decorative: the label carries it. */
  unit?: string;
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
    <View style={[styles.root, compact && styles.rootCompact]}>
      <Text variant={compact ? 'caption' : 'label'} color="textMuted" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.row, compact && styles.rowCompact]}>
        <StepButton label={decrease} icon="minus" onPress={() => bump(-step)} compact={compact} />
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
            compact ? [styles.inputCompact, typography.title2] : typography.display,
            { color: colors.text, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        />
        {unit ? (
          <Text variant="captionStrong" color="textMuted" style={styles.unit} accessibilityElementsHidden>
            {unit}
          </Text>
        ) : null}
        <StepButton label={increase} icon="plus" onPress={() => bump(step)} compact={compact} />
      </View>
    </View>
  );
}

function StepButton({
  label,
  icon,
  onPress,
  compact,
}: {
  label: string;
  icon: 'minus' | 'plus';
  onPress: () => void;
  compact?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        compact && styles.stepCompact,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size="lg" color="primary" />
    </Pressable>
  );
}

const STEP_SIZE = MIN_TOUCH + spacing.md;

const styles = StyleSheet.create({
  root: { flexGrow: 1, flexBasis: 220, gap: spacing.xs },
  rootCompact: { flexBasis: 150 },
  label: { textAlign: 'left', alignSelf: 'stretch' },
  rowCompact: { gap: spacing.xs },
  stepCompact: { width: MIN_TOUCH, height: MIN_TOUCH + spacing.xs },
  inputCompact: { height: MIN_TOUCH + spacing.xs, minWidth: 52 },
  unit: { marginLeft: -spacing.xxs },
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
