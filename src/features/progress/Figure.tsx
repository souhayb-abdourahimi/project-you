import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { radius, spacing, useColors } from '@/theme';

/**
 * One counted fact as a figure: the number big, what it counts below (W-10 "moins de texte"). Only
 * real counts reach it; a fact that did not happen is not drawn as a zero. Read as one phrase.
 */
export function Figure({ value, label }: { value: string; label: string }) {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[styles.figure, { backgroundColor: colors.surfaceSubtle }]}>
      <Text variant="title2">{value}</Text>
      <Text variant="caption" color="textSecondary" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Figures side by side, wrapping on narrow screens (3 per row on an iPhone SE). */
export function Figures({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  figure: {
    flexGrow: 1,
    flexBasis: 90,
    minWidth: 90,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
});
