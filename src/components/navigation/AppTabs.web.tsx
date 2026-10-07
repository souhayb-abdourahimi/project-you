import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { MIN_TOUCH, WIDE_BREAKPOINT, elevation, radius, spacing, useColors } from '@/theme';

import { TABS } from './tabs';

/**
 * Web: a bottom bar on phones (mobile first), a quiet sidebar on wide screens. Icon and label are
 * always visible; the active tab is told by colour, a soft pill and its selected state.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  return (
    <Tabs style={StyleSheet.flatten([styles.root, { flexDirection: wide ? 'row' : 'column-reverse' }])}>
      <TabList
        style={StyleSheet.flatten([
          wide ? styles.sidebar : styles.bottom,
          wide ? null : elevation.raised,
          { backgroundColor: colors.surface, borderColor: colors.border },
          wide ? null : { paddingBottom: Math.max(insets.bottom, spacing.xs) },
        ])}>
        {wide ? (
          <Text variant="title3" style={styles.brand}>
            Project You
          </Text>
        ) : null}
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton wide={wide} icon={tab.icon} label={t(tab.labelKey)} />
          </TabTrigger>
        ))}
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

function TabButton({
  isFocused,
  wide,
  icon,
  label,
  ...props
}: TabTriggerSlotProps & { wide: boolean; icon: IconName; label: string }) {
  const colors = useColors();
  const tint = isFocused ? 'primary' : 'textMuted';
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      aria-selected={!!isFocused}
      style={({ pressed }) => [
        styles.tab,
        wide ? styles.tabWide : styles.tabNarrow,
        wide && isFocused && { backgroundColor: colors.primarySubtle },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={[!wide && styles.pill, !wide && isFocused && { backgroundColor: colors.primarySubtle }]}>
        <Icon name={icon} size={wide ? 'md' : 22} color={tint} />
      </View>
      <Text
        variant={wide ? 'bodyMedium' : 'micro'}
        color={tint}
        style={isFocused ? styles.active : null}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slot: { flex: 1 },
  // TabList defaults to a row; the sidebar stacks its tabs.
  sidebar: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    width: 248,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  brand: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  tab: { minHeight: MIN_TOUCH, borderRadius: radius.md },
  tabWide: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  tabNarrow: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.xxs },
  pill: { width: 56, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  active: { fontWeight: '600' },
});
