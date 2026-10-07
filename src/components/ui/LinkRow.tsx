import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, spacing, useColors } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** A row that opens another screen: its title, an optional summary of the current value. */
export function LinkRow({
  label,
  summary,
  icon,
  grouped,
  onPress,
}: {
  label: string;
  summary?: string;
  icon?: IconName;
  /** Inside a ListGroup: the row carries its own inner padding. */
  grouped?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      role="link"
      accessibilityRole="link"
      accessibilityLabel={summary ? `${label}, ${summary}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        grouped && styles.grouped,
        pressed ? { backgroundColor: colors.surfaceSubtle } : null,
      ]}>
      {icon ? <Icon name={icon} size="md" color="textSecondary" /> : null}
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
  grouped: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
});
