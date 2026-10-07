import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, layout, spacing, useColors, useCompact } from '@/theme';

export function Screen({
  children,
  scroll = true,
  airy,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Main screens (W-9): more air between sections. */
  airy?: boolean;
}) {
  const colors = useColors();
  const compact = useCompact();
  const content = (
    <View style={[styles.content, airy && styles.airy, airy && compact && styles.airyCompact]}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          // Forms (W-8): the focused field stays above the keyboard on iOS; typed values live in state,
          // so closing the keyboard never loses them.
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  airy: { gap: layout.sectionGap, paddingTop: spacing.lg, paddingBottom: spacing['3xl'] },
  airyCompact: { gap: spacing.xl, paddingTop: spacing.sm, paddingHorizontal: spacing.lg },
});
