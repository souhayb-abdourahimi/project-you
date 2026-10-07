import { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { useTranslation } from 'react-i18next';

import { layout, motion, radius, spacing, useColors, useCompact, useReducedMotion, type ColorToken } from '@/theme';

import { Card } from './Card';
import { Icon, type IconName } from './Icon';
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

/** A soft placeholder block; it breathes slowly unless Reduce Motion is on. */
export function Skeleton({
  height = 16,
  width = '100%',
  round,
}: {
  height?: number;
  width?: DimensionValue;
  round?: boolean;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: motion.slow * 3, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: motion.slow * 3, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <Animated.View
      style={{
        height,
        width,
        borderRadius: round ? radius.pill : radius.sm,
        backgroundColor: colors.surfaceSubtle,
        opacity: pulse,
      }}
    />
  );
}

/**
 * Loading state of a screen: the shape of what is coming (a header, a hero, a few cards), never a
 * big spinner in the middle. Announced as busy with its label.
 */
export function LoadingScreen({ message }: { message?: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const label = message ?? t('common.loading');
  return (
    <View
      style={[styles.loading, { backgroundColor: colors.background }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}>
      <View style={styles.loadingColumn}>
        <Skeleton height={14} width="35%" />
        <Skeleton height={30} width="70%" />
        <Skeleton height={190} />
        <View style={styles.loadingRow}>
          <Skeleton height={92} width="31%" />
          <Skeleton height={92} width="31%" />
          <Skeleton height={92} width="31%" />
        </View>
        <Skeleton height={72} />
      </View>
    </View>
  );
}

/** Explains, reassures and, when it helps, offers the next step. Never a bare "Aucune donnée". */
export function EmptyState({
  message,
  title,
  icon,
  action,
}: {
  message: string;
  title?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <Card tone="subtle" style={styles.empty}>
      {icon ? <Icon name={icon} size="lg" color="textMuted" /> : null}
      {title ? <Text variant="headline">{title}</Text> : null}
      <Text color="textSecondary">{message}</Text>
      {action}
    </Card>
  );
}

export type NoticeTone = 'neutral' | 'info' | 'caution' | 'positive' | 'danger';

const NOTICE: Record<NoticeTone, { background: ColorToken; accent: ColorToken; icon: IconName }> = {
  neutral: { background: 'surfaceSubtle', accent: 'textSecondary', icon: 'info' },
  info: { background: 'primarySubtle', accent: 'primary', icon: 'info' },
  caution: { background: 'warningSubtle', accent: 'warning', icon: 'safety' },
  positive: { background: 'successSubtle', accent: 'success', icon: 'done' },
  danger: { background: 'dangerSubtle', accent: 'danger', icon: 'info' },
};

/**
 * A tinted note: identifiable at once, never alarming. `caution` is the safety surface; `danger`
 * is kept for a real error or a destructive consequence.
 */
export function Notice({
  title,
  message,
  tone = 'neutral',
  icon,
  children,
  role = 'alert',
}: {
  title?: string;
  message?: string;
  tone?: NoticeTone;
  icon?: IconName;
  children?: ReactNode;
  role?: 'alert' | 'summary';
}) {
  const colors = useColors();
  const look = NOTICE[tone];
  return (
    <View accessibilityRole={role} style={[styles.notice, { backgroundColor: colors[look.background] }]}>
      <Icon name={icon ?? look.icon} size="md" color={look.accent} />
      <View style={styles.noticeText}>
        {title ? (
          <Text variant="headline" color="textPrimary">
            {title}
          </Text>
        ) : null}
        {message ? <Text color="textSecondary">{message}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const BANNER_TONE: Partial<Record<ColorToken, NoticeTone>> = {
  warning: 'caution',
  primary: 'info',
  textMuted: 'neutral',
  success: 'positive',
  danger: 'danger',
};

/** Legacy one-line banner, drawn as a Notice. */
export function Banner({ message, tone = 'warning' }: { message: string; tone?: ColorToken }) {
  return <Notice message={message} tone={BANNER_TONE[tone] ?? 'neutral'} />;
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card dense style={styles.tile}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Text variant="metric">{value}</Text>
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

/** A section of a screen: a calm title, an optional action on the right, then its content. */
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title3" style={styles.flex}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** The large header of a main screen: a title, a quiet line under it, an accessory on the right. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  // A small phone keeps the greeting on one line: one step down the type scale, same hierarchy.
  const compact = useCompact();
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        {subtitle ? (
          <Text variant="captionStrong" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
        <Text variant={compact ? 'title2' : 'title1'}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Initials in a soft circle (no photo is invented). */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const colors = useColors();
  const initial = name.trim().charAt(0).toUpperCase() || '·';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { width: size, height: size, backgroundColor: colors.primarySubtle }]}>
      <Text variant="headline" color="primary">
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center' },
  loadingColumn: {
    width: '100%',
    maxWidth: 560,
    padding: layout.screenPadding,
    paddingTop: spacing['3xl'],
    gap: spacing.lg,
  },
  loadingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.xs },
  empty: { gap: spacing.sm },
  notice: { flexDirection: 'row', gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg },
  noticeText: { flex: 1, gap: spacing.xs },
  tile: { flex: 1, minWidth: 104 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});

/**
 * A personal word from the coach (W-9 §3.1): a small round mark, "Ton coach", a short message and
 * at most one action. A note, not a chat bubble and not a block of data.
 */
export function CoachNote({
  label,
  title,
  message,
  children,
}: {
  label: string;
  title?: string;
  message?: string;
  children?: ReactNode;
}) {
  const colors = useColors();
  return (
    <Card style={coachStyles.card}>
      <View style={[coachStyles.mark, { backgroundColor: colors.primarySubtle }]}>
        <Icon name="coach" size="md" color="primary" />
      </View>
      <View style={coachStyles.body}>
        <Text variant="captionStrong" color="primary">
          {label}
        </Text>
        {title ? <Text variant="headline">{title}</Text> : null}
        {message ? <Text color="textSecondary">{message}</Text> : null}
        {children}
      </View>
    </Card>
  );
}

const coachStyles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  mark: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: spacing.xs },
});
