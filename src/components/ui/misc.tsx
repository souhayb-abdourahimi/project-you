import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { radius, spacing, useColors, type ColorToken } from '@/theme';

import { Card } from './Card';
import { Text } from './Text';

/** Mandatory marker on any demo data (docs/DATA_SOURCES.md). */
export function MockBadge() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View accessibilityLabel={t('common.mockHint')} style={[styles.badge, { borderColor: colors.mock }]}>
      <Text variant="caption" color="mock">
        {t('common.mock')}
      </Text>
    </View>
  );
}

/** Full-screen loading state with an accessible label. */
export function LoadingScreen({ message }: { message?: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const label = message ?? t('common.loading');
  return (
    <View
      style={[styles.loading, { backgroundColor: colors.background }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} />
      <Text color="textMuted">{label}</Text>
    </View>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Card muted>
      <Text color="textMuted">{message}</Text>
      {action}
    </Card>
  );
}

export function Banner({ message, tone = 'warning' }: { message: string; tone?: ColorToken }) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { borderColor: colors[tone], backgroundColor: colors.surface }]}>
      <Text variant="label" color={tone}>
        {message}
      </Text>
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={styles.tile}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="title">{value}</Text>
      {hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="heading">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.xs },
  banner: { borderLeftWidth: 4, borderRadius: radius.sm, padding: spacing.md },
  tile: { flex: 1, minWidth: 140 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
