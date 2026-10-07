import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors, type ColorToken } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** iOS-style grouped section: a quiet title above, rows in one card, hairlines between them. */
export function ListGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const colors = useColors();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="captionStrong" color="textMuted" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" color="textMuted" style={styles.title}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** One row: an icon, a title, the current value on the right, a chevron when it opens a screen. */
export function ListRow({
  title,
  value,
  icon,
  iconColor = 'textSecondary',
  onPress,
}: {
  title: string;
  value?: string;
  icon?: IconName;
  iconColor?: ColorToken;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      role={onPress ? 'link' : undefined}
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surfaceSubtle } : null]}>
      {icon ? <Icon name={icon} size="md" color={iconColor} /> : null}
      <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
        {title}
      </Text>
      {value ? (
        <Text color="textMuted" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Icon name="chevron" size="sm" color="textMuted" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg },
  row: {
    minHeight: MIN_TOUCH + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  flex: { flex: 1 },
  value: { maxWidth: '50%' },
});
