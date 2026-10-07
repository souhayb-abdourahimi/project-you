import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, spacing, useColors } from '@/theme';

import { Icon } from './Icon';
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
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surfaceSubtle } : null]}>
      <View style={styles.text}>
        <Text variant="bodyMedium">{label}</Text>
        {summary ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron" size="sm" color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: { flex: 1, gap: 2 },
});
