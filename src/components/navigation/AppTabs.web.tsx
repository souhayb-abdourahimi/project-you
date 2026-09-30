import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH, WIDE_BREAKPOINT, radius, spacing, useColors } from '@/theme';

import { TABS } from './tabs';

/** Web: sidebar on wide screens, bottom bar on narrow ones. */
export default function AppTabs() {
  const { t } = useTranslation();
  const colors = useColors();
  const wide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  return (
    <Tabs style={StyleSheet.flatten([styles.root, { flexDirection: wide ? 'row' : 'column-reverse' }])}>
      <TabList
        style={StyleSheet.flatten([
          wide ? styles.sidebar : styles.bottom,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ])}>
        {wide ? (
          <Text variant="heading" style={styles.brand}>
            Project You
          </Text>
        ) : null}
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton wide={wide}>{t(tab.labelKey)}</TabButton>
          </TabTrigger>
        ))}
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

function TabButton({ children, isFocused, wide, ...props }: TabTriggerSlotProps & { wide: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={[
        styles.tab,
        wide ? styles.tabWide : styles.tabNarrow,
        isFocused && { backgroundColor: colors.surfaceMuted },
      ]}>
      <Text variant="label" color={isFocused ? 'primary' : 'textMuted'}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slot: { flex: 1 },
  sidebar: {
    width: 240,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderRightWidth: 1,
  },
  bottom: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, paddingVertical: spacing.xs },
  brand: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  tab: { minHeight: MIN_TOUCH, justifyContent: 'center', borderRadius: radius.md },
  tabWide: { paddingHorizontal: spacing.md },
  tabNarrow: { paddingHorizontal: spacing.sm, flex: 1, alignItems: 'center' },
});
