import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, spacing, useColors, useScheme } from '@/theme';

export function Card({ children, style, muted }: { children: ReactNode; style?: ViewStyle; muted?: boolean }) {
  const colors = useColors();
  const scheme = useScheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: muted ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
        scheme === 'light' ? styles.shadow : styles.border,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  shadow: { boxShadow: '0 1px 3px rgba(27, 25, 23, 0.08)' },
  border: { borderWidth: StyleSheet.hairlineWidth },
});
