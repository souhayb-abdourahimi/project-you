import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import type { MealSlot } from '@/domain/meals/recipes';
import { focusPosition, heroFit } from '@/features/media/registry';
import { gradients, gradientStyle, motion, radius, useColors, useReducedMotion } from '@/theme';

import { recipeMedia } from './recipeMedia';

const SLOT_ICON: Record<MealSlot, IconName> = {
  breakfast: 'breakfast',
  lunch: 'meal',
  dinner: 'meal',
  snack: 'snack',
};

/**
 * The picture of a recipe: its validated photo (`recipe.id -> media`, recipeMedia.ts), else a calm
 * drawn tile (the meal's moment as a glyph on the nutrition tint). Never a generic food photo that
 * could show another dish. Named for screen readers only when it is a real photo.
 *
 * - `thumb`: square, at the start of a meal row (1:1 crop around the photo's focal point).
 * - `banner`: wide picture (16:10) for a recipe detail — only from a large landscape master
 *   (`heroFit`); a small photo is never upscaled into a banner, the artwork stays.
 */
export function MealMedia({
  recipeId,
  slot,
  label,
  variant = 'thumb',
  size = 64,
}: {
  recipeId: string;
  slot?: MealSlot;
  label: string;
  variant?: 'thumb' | 'banner';
  size?: number;
}) {
  const colors = useColors();
  const { i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const media = recipeMedia(recipeId);
  const thumb = variant === 'thumb';
  const photo = media && !failed && (thumb || heroFit(media) === 'cover') ? media : null;
  const description = photo ? photo.alt[i18n.language === 'en' ? 'en' : 'fr'] || label : undefined;
  return (
    <View
      accessibilityRole={photo ? 'image' : undefined}
      accessibilityLabel={description}
      accessibilityElementsHidden={!photo}
      importantForAccessibility={photo ? 'auto' : 'no-hide-descendants'}
      style={[
        thumb ? [styles.thumb, { width: size, height: size }] : styles.banner,
        { backgroundColor: colors.successSubtle },
      ]}>
      {photo ? (
        <Image
          source={photo.source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={focusPosition(photo)}
          transition={reducedMotion ? 0 : motion.slow}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.tileGlow)]} />
          <View style={styles.centre}>
            <Icon
              name={slot ? SLOT_ICON[slot] : 'meal'}
              size={thumb ? Math.round(size * 0.38) : 34}
              color="nutrition"
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: radius.md + 2, overflow: 'hidden' },
  banner: { aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: 'hidden' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
