import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { motion, radius, spacing, useColors, useReducedMotion } from '@/theme';

import { Icon } from '@/components/ui/Icon';

/**
 * A recipe image surface.
 *
 * Only an explicitly mapped Project You media URI is rendered as a photo (`recipe.id -> validated
 * media`). Missing or failed media falls back to a quiet branded tile; we never substitute a random
 * image that could depict the wrong meal.
 *
 * - `thumb` (W-10 default): the square thumbnail at the start of a meal row.
 * - `banner`: a wide picture (recipe library, meal detail).
 */
export function MealMedia({
  uri,
  label,
  variant = 'thumb',
  size = 64,
}: {
  uri?: string | null;
  label: string;
  variant?: 'thumb' | 'banner';
  /** Side of the thumbnail. */
  size?: number;
}) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const photo = uri && !failed ? uri : null;
  const thumb = variant === 'thumb';

  return (
    <View
      accessibilityRole={photo ? 'image' : undefined}
      accessibilityLabel={photo ? label : undefined}
      accessibilityElementsHidden={!photo}
      importantForAccessibility={photo ? 'auto' : 'no-hide-descendants'}
      style={[
        thumb ? [styles.thumb, { width: size, height: size }] : styles.banner,
        { backgroundColor: colors.surfaceSubtle },
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
        <View style={styles.fallback}>
          <View style={[styles.mark, thumb && styles.markThumb, { backgroundColor: colors.surface }]}>
            <Icon name="meal" size={thumb ? 20 : 26} color="nutrition" />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: radius.md + 2, overflow: 'hidden', position: 'relative' },
  banner: { height: 132, borderRadius: radius.lg, overflow: 'hidden', position: 'relative' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  mark: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  markThumb: { width: 36, height: 36 },
});
