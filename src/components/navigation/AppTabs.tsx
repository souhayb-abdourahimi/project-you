import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

import { ICONS } from '@/components/ui/Icon';
import { useColors } from '@/theme';

import { TABS } from './tabs';

/**
 * iOS / Android: the platform's own tab bar (UITabBar, Material navigation bar) with the app's
 * colours: native safe areas, back behaviour, haptics and accessibility for free.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      tintColor={colors.primary}
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      indicatorColor={colors.primarySubtle}
      rippleColor={colors.primarySubtle}
      labelVisibilityMode="labeled"
      labelStyle={{ default: { color: colors.textMuted }, selected: { color: colors.primary } }}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{t(tab.labelKey)}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={ICONS[tab.icon].sf} md={ICONS[tab.icon].md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
