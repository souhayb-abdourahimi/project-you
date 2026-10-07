import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useColors, type ColorToken } from '@/theme';

/**
 * A circular progress for ONE main value (W-9). Drawn with two clipped half rings (no SVG
 * dependency); the value is always given as text to screen readers, and the centre shows it too.
 */
export function ProgressRing({
  value,
  size = 112,
  stroke = 10,
  color = 'primary',
  label,
  children,
}: {
  /**
   * 0 → 1. Above 1 (a target met or passed) the ring is simply full: no other colour, no warning,
   * and the real value stays in `label` and in the centre.
   */
  value: number;
  size?: number;
  stroke?: number;
  color?: ColorToken;
  /** The value in words ("92 g sur 140 g de protéines"). */
  label: string;
  children?: ReactNode;
}) {
  const colors = useColors();
  const p = Math.max(0, Math.min(1, value));
  const angle = p * 360;
  const fill = colors[color];
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  const half = { width: size / 2, height: size, overflow: 'hidden' as const, position: 'absolute' as const, top: 0 };
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100), text: label }}
      style={{ width: size, height: size }}>
      <View style={[ring, styles.abs, { borderColor: colors.surfaceSubtle }]} />
      {angle > 0 ? (
        <>
          {/* 0 → 180°: a left half ring turned clockwise into the right half. */}
          <View style={[half, { left: size / 2 }]}>
            <View
              style={[
                ring,
                styles.transparent,
                {
                  marginLeft: -size / 2,
                  borderLeftColor: fill,
                  borderBottomColor: fill,
                  transform: [{ rotate: `${45 + Math.min(angle, 180)}deg` }],
                },
              ]}
            />
          </View>
          {/* 180 → 360°: a right half ring turned into the left half. */}
          {angle > 180 ? (
            <View style={[half, { left: 0 }]}>
              <View
                style={[
                  ring,
                  styles.transparent,
                  {
                    borderRightColor: fill,
                    borderTopColor: fill,
                    transform: [{ rotate: `${45 + (angle - 180)}deg` }],
                  },
                ]}
              />
            </View>
          ) : null}
        </>
      ) : null}
      <View
        style={[styles.abs, styles.centre]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        {children}
      </View>
    </View>
  );
}

/**
 * Tiny bar chart (one bar a day): real values only. A day without data is a flat dot, never a
 * zero bar. The chart is decorative for screen readers: `label` describes it in one sentence.
 */
export function MiniBars({
  values,
  label,
  color = 'primary',
  height = 44,
}: {
  values: readonly (number | null)[];
  label: string;
  color?: ColorToken;
  height?: number;
}) {
  const colors = useColors();
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.bars, { height }]}>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <View key={i} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                v === null
                  ? { height: 4, backgroundColor: colors.surfaceSubtle }
                  : {
                      height: Math.max(4, (v / max) * height),
                      backgroundColor: last ? colors[color] : colors.primarySubtle,
                    },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  transparent: { borderColor: 'transparent' },
  bars: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.xs },
  barSlot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 14, borderRadius: radius.sm / 2 },
});
