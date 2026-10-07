import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  MIN_TOUCH,
  PRESSED_SCALE,
  borderWidth,
  elevation,
  layout,
  radius,
  spacing,
  useColors,
  useScheme,
  type ColorToken,
} from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * surface: the default white card. subtle: a secondary zone. inverse: the graphite hero of a screen.
 * accent: a soft blue card (an adaptation, a proposal). caution / positive: a tinted note (safety,
 * a success) that never shouts.
 */
export type CardTone = 'surface' | 'subtle' | 'inverse' | 'accent' | 'caution' | 'positive';

const BACKGROUND: Record<CardTone, ColorToken> = {
  surface: 'surface',
  subtle: 'surfaceSubtle',
  inverse: 'inverse',
  accent: 'primarySubtle',
  caution: 'warningSubtle',
  positive: 'successSubtle',
};

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: CardTone;
  /** Legacy: `muted` is the subtle tone. */
  muted?: boolean;
  /** Lifts the card (the hero, a floating element); cards otherwise sit on a hairline. */
  raised?: boolean;
  /** Tighter padding for a dense list card. */
  dense?: boolean;
  accessibilityLabel?: string;
}

/** SurfaceCard: every card of the app is this, with a tone. */
export function Card({ children, style, tone, muted, raised, dense, accessibilityLabel }: CardProps) {
  const colors = useColors();
  const scheme = useScheme();
  const t: CardTone = tone ?? (muted ? 'subtle' : 'surface');
  const outlined = t === 'surface' && (scheme === 'dark' || !raised);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        dense && styles.dense,
        { backgroundColor: colors[BACKGROUND[t]] },
        outlined && { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        scheme === 'light' && (raised ? elevation.raised : t === 'surface' ? elevation.card : null),
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * HeroCard: the priority of a screen. An overline, a title, facts as chips, then its actions.
 * `inverse` (graphite) for the one thing to do now; `surface` when the day is calmer.
 */
export function HeroCard({
  overline,
  title,
  meta,
  icon,
  children,
  tone = 'inverse',
  titleVariant = 'title1',
  media,
}: {
  overline: string;
  title: string;
  titleVariant?: 'title1' | 'title2' | 'title3';
  /** A visual filling the card behind its content (HeroMedia); the text stays on top. */
  media?: ReactNode;
  meta?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
  tone?: 'inverse' | 'surface' | 'positive' | 'accent';
}) {
  const dark = tone === 'inverse';
  return (
    <Card tone={tone} raised={tone !== 'positive'} style={[styles.hero, media ? styles.heroMedia : null]}>
      {media}
      <View style={styles.heroTop}>
        {icon ? <Icon name={icon} size="sm" color={dark ? 'onInverseMuted' : 'primary'} /> : null}
        <Text variant="overline" color={dark ? 'onInverseMuted' : 'textSecondary'}>
          {overline}
        </Text>
      </View>
      <Text variant={titleVariant} color={dark ? 'onInverse' : 'textPrimary'}>
        {title}
      </Text>
      {meta ? <View style={styles.meta}>{meta}</View> : null}
      {children ? <View style={styles.heroBody}>{children}</View> : null}
    </Card>
  );
}

/** A number that matters: label, a strong value, a smaller unit, an optional line below. */
export function MetricCard({
  label,
  value,
  unit,
  caption,
  icon,
  iconColor = 'textSecondary',
  accessibilityLabel,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  icon?: IconName;
  iconColor?: ColorToken;
  accessibilityLabel?: string;
}) {
  return (
    <Card
      dense
      style={styles.metric}
      accessibilityLabel={
        accessibilityLabel ?? [label, `${value}${unit ? ` ${unit}` : ''}`, caption].filter(Boolean).join(', ')
      }>
      <View style={styles.metricLabel} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {icon ? <Icon name={icon} size="sm" color={iconColor} /> : null}
        <Text variant="captionStrong" color="textSecondary" style={styles.flex}>
          {label}
        </Text>
      </View>
      <View style={styles.metricValue} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="metric">{value}</Text>
        {unit ? (
          <Text variant="captionStrong" color="textMuted">
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text
          variant="caption"
          color="textMuted"
          numberOfLines={2}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}

/** ActionCard: a pressable row card that opens a screen (icon, title, summary, chevron). */
export function ActionCard({
  title,
  summary,
  icon,
  iconColor = 'primary',
  onPress,
  accessibilityHint,
}: {
  title: string;
  summary?: string;
  icon?: IconName;
  iconColor?: ColorToken;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary ? `${title}, ${summary}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.action,
        elevation.card,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          transform: [{ scale: pressed ? PRESSED_SCALE : 1 }],
        },
      ]}>
      {icon ? (
        <View style={[styles.iconWell, { backgroundColor: colors.surfaceSubtle }]}>
          <Icon name={icon} size="md" color={iconColor} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Text variant="headline">{title}</Text>
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
  card: { borderRadius: radius.card, padding: layout.cardPadding, gap: spacing.sm },
  dense: { padding: spacing.lg, borderRadius: radius.lg },
  hero: { gap: spacing.md, padding: spacing.xl },
  heroMedia: { overflow: 'hidden', minHeight: 300, justifyContent: 'flex-end', paddingTop: spacing['3xl'] },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroBody: { gap: spacing.md, marginTop: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { flex: 1, minWidth: 104, gap: spacing.xs },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metricValue: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.thin,
    borderColor: 'transparent',
  },
  flex: { flex: 1, gap: 2 },
});
