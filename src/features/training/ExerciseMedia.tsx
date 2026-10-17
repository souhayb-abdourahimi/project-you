import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { getExercise, type MovementPattern } from '@/domain/training/exercises';
import { focusPosition } from '@/features/media/registry';
import { gradients, gradientStyle, motion, radius, spacing, useColors, useReducedMotion } from '@/theme';

import { exerciseMedia } from './exerciseMedia';

/** The drawn artwork names the movement family, never a specific exercise it might not be. */
export const PATTERN_ICON: Record<MovementPattern, IconName> = {
  squat: 'patternSquat',
  lunge: 'patternSquat',
  hinge: 'patternHinge',
  push_horizontal: 'patternPush',
  push_vertical: 'patternPush',
  pull_horizontal: 'patternPull',
  pull_vertical: 'patternPull',
  arms: 'patternPush',
  core: 'patternCore',
};

/**
 * The picture of an exercise: its validated media (`exercise.id -> media`, exerciseMedia.ts), else a
 * drawn artwork of its movement family. Same crop rules everywhere: `hero` 16:9 above the exercise
 * in progress (children drawn on top: its position, its muscles), `thumb` square in lists,
 * alternatives and records. Named for screen readers only when it is a real photo.
 */
export function ExerciseMedia({
  exerciseId,
  label,
  variant = 'thumb',
  size = 52,
  children,
}: {
  exerciseId: string;
  label: string;
  variant?: 'thumb' | 'hero';
  size?: number;
  /** Hero only: overlay content (kept readable by a scrim on photos). */
  children?: ReactNode;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const media = exerciseMedia(exerciseId);
  const photo = media && !failed ? media : null;
  const hero = variant === 'hero';
  const icon = PATTERN_ICON[getExercise(exerciseId)?.pattern ?? 'core'];
  return (
    <View
      style={[
        hero ? styles.hero : [styles.thumb, { width: size, height: size }],
        { backgroundColor: hero ? colors.inverse : colors.primarySubtle },
      ]}>
      <View
        style={StyleSheet.absoluteFill}
        accessible={!!photo}
        accessibilityRole={photo ? 'image' : undefined}
        accessibilityLabel={photo ? label : undefined}
        accessibilityElementsHidden={!photo}
        importantForAccessibility={photo ? 'auto' : 'no-hide-descendants'}>
        {photo ? (
          <>
            <Image
              source={photo.source}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition={focusPosition(photo)}
              transition={reduced ? 0 : motion.slow}
              onError={() => setFailed(true)}
            />
            {hero ? <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.heroScrim)]} /> : null}
          </>
        ) : hero ? (
          <>
            <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.heroGlow)]} />
            <View style={[styles.ring, styles.ringLarge, { borderColor: colors.inverseFill }]} />
            <View style={[styles.ring, styles.ringSmall, { borderColor: colors.inverseFill }]} />
            <View style={styles.glyph}>
              <Icon name={icon} size={112} color="onInverse" />
            </View>
          </>
        ) : (
          <>
            <View style={[StyleSheet.absoluteFill, gradientStyle(gradients.tileGlow)]} />
            <View style={styles.centre}>
              <Icon name={icon} size={Math.round(size * 0.46)} color="training" />
            </View>
          </>
        )}
      </View>
      {hero && children ? <View style={styles.overlay}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: radius.md, overflow: 'hidden' },
  hero: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'space-between' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5, borderRadius: radius.pill },
  ringLarge: { width: 280, height: 280, top: -90, right: -80 },
  ringSmall: { width: 170, height: 170, top: -25, right: -15 },
  glyph: { position: 'absolute', right: 22, top: 18, opacity: 0.3 },
  overlay: { flex: 1, padding: spacing.md + spacing.xxs, justifyContent: 'space-between' },
});
