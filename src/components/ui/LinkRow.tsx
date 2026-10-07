import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** A row that opens another screen: its title, an optional summary of the current value. */
export function LinkRow({ label, summary, onPress }: { label: string; summary?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      role="link"
      accessibilityRole="link"
      accessibilityLabel={summary ? `${label}, ${summary}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surfaceMuted } : null]}>
      <View style={styles.text}>
        <Text variant="label">{label}</Text>
        {summary ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
      </View>
      <Text color="textMuted" importantForAccessibility="no" accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  text: { flex: 1, gap: 2 },
});
