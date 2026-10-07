import { StyleSheet, View } from 'react-native';

import { radius, useColors, type ColorToken } from '@/theme';

export function ProgressBar({
  value,
  label,
  color = 'primary',
  track = 'surfaceSubtle',
}: {
  value: number;
  label: string;
  color?: ColorToken;
  /** The empty part: `inverseFill` on a graphite card. */
  track?: ColorToken;
}) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: colors[track] }]}>
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: colors[color] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: radius.pill },
});
