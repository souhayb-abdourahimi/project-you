import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { motion, radius, spacing, useColors, useReducedMotion } from '@/theme';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';

/**
 * A recipe image surface.
 *
 * Only an explicitly mapped Project You media URI is rendered as a photo. Missing or failed media
 * falls back to a neutral branded artwork; we never substitute a random image that could depict
 * the wrong meal.
 */
export function MealMedia({
  uri,
  label,
  compact,
}: {
  uri?: string | null;
  label: string;
  compact?: boolean;
}) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const photo = uri && !failed ? uri : null;

  return (
    <View
      accessibilityRole={photo ? 'image' : undefined}
      accessibilityLabel={photo ? label : undefined}
      accessibilityElementsHidden={!photo}
      importantForAccessibility={photo ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.root,
        compact && styles.compact,
        { backgroundColor: colors.inverse },
      ]}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reducedMotion ? 0 : motion.slow}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <View style={[styles.glow, { backgroundColor: colors.nutrition }]} />
          <View style={[styles.circle, styles.circleLarge, { borderColor: colors.inverseFill }]} />
          <View style={[styles.circle, styles.circleSmall, { borderColor: colors.inverseFill }]} />
          <View style={styles.fallback}>
            <Icon name="meal" size={compact ? 28 : 38} color="onInverse" />
            <Text variant="captionStrong" color="onInverseMuted">
              PROJECT YOU
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 154,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  compact: { height: 104 },
  glow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: radius.pill,
    right: -45,
    top: -75,
    opacity: 0.25,
  },
  circle: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  circleLarge: { width: 170, height: 170, right: -42, top: -56 },
  circleSmall: { width: 112, height: 112, right: -12, top: -26 },
  fallback: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: spacing.lg,
    gap: spacing.xs,
  },
});
