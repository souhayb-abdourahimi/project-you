import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, Text } from '@/components/ui';
import { applyUpdate, onUpdateReady } from '@/services/web';
import { borderWidth, elevation, radius, spacing, useColors } from '@/theme';

/**
 * "Nouvelle version disponible — Mettre à jour" (web / installed app, D-048). Shown only when a
 * new build is installed while this one runs; the user chooses when to reload, nothing is lost.
 * Native builds never get the event, so it never renders there.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => onUpdateReady(() => setReady(true)), []);
  if (!ready || hidden) return null;
  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        elevation.raised,
        { top: insets.top + spacing.sm, backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <Text variant="captionStrong" style={styles.flex}>
        {t('common.update.available')}
      </Text>
      <Button compact label={t('common.update.apply')} onPress={applyUpdate} />
      <IconButton icon="close" tone="plain" label={t('common.update.later')} onPress={() => setHidden(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: borderWidth.thin,
  },
  flex: { flex: 1 },
});
